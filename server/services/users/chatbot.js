// 원격에서 작업중
const models = require('../../models');
const config = require('../../../configs');
const Op = models.sequelize.Op;
const crypto = require('crypto');
const moment = require('moment');
const arrayShuffle = require('array-shuffle');
const schedule = require('node-schedule');
const request = require('request');
const client = require('cheerio-httpcli');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const qs = require('qs');
const Hangul = require('hangul-js');
const nodemailer = require('nodemailer');

const param = {};
client.set('headers', {           // 크롤링 방지 우회를 위한 User-Agent setting
  'data-useragent' : 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36',
  'Accept-Charset': 'utf-8'
});


let closedown_scheduler = schedule.scheduleJob('20 4 1 * *', function(){
  request('http://jellynlp-dev.ap-northeast-2.elasticbeanstalk.com/verify_close/', function (error, response, body) {
    if(error){
      console.log('Error at closedown_scheduler : ' + error);
    }else{
      console.log(response);
    }
  });
});
//var logger = require('../../config/winston');

function verifyToken (req, res) {
    console.log(req.body);
    console.log(req.headers);
    const cookie = req.cookies || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;
    let onetime = cookies.onetime;
    const secret = config.jwt_secret;

    console.log(`cookie: ${cookie}`);
    console.log(`token: ${token}`);
    console.log(`onetime: ${onetime}`);
    if (token) {
        console.log('token given');

        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                res.clearCookie('token');
                res.clearCookie('onetime');
                return res.status(403).json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
            } else {
                models.User.findOne({
                    where: {
                        email: decoded.email
                    }
                }).then(user => {
                    if(onetime === '1') {
                      return res.status(403).json({success: false, message: 'One time user.'})
                    } else {
                      return res.status(200).json({success: true, message: 'Token verified.', email: user.email, name: user.name, redirect: '/lobby'})
                    }
                }).catch(function (err){
                    return res.status(403).json({success: false, message: 'Token verified, but new token cannot be assigned. err: ' + err.message})
                })
            }
        })
    } else {
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        })
    }
}

function checkTokenVerified (req, res, next){
    const cookie = req.cookies || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;
    const secret = config.jwt_secret;

    // decode token
    if (token) {
        // verifies secret and checks exp
        jwt.verify(token, secret, function(err, decoded) {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
            } else {
                // if everything is good, save decoded token payload to request for use in other routes
                console.log('Token verified')
                // req.decoded 에 저장해두어야 이후 함수에서 refer 가능.
                req.decoded = decoded;
                next()
            }
        });
    } else {
        // return an error if there is no token
        return res.status(403).send({
            success: false,
            message: 'API call not allowed. No token provided.'
        });
    }
}

function registerUser (req, res) {
    const email = req.body.email || '';
    const password = req.body.password;
    const name = req.body.name;
    const gender = req.body.gender;
    const birthYear = req.body.birthYear;
    const phone = req.body.phone;

    // Check if email arrived
    if (!email.length) {
        return res.status(400).json({success: false, error: 'Email not given'});
    }

    // Validate Email Regex
    let re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!re.test(email)){
        return res.status(400).json({success: false, error: 'Incorrect email'})
    }

    // Check if password arrived
    if (!password.length) {
        return res.status(400).json({success: false, error: 'Password not given'});
    }

    // Check if password > 6 alphanumeric
    if(password.length < 8 ){
        return res.status(400).json({success: false, error: 'Password needs to be longer than 6 alphanumeric characters.'});
    }
    let pwNum = password.search(/[0-9]/g);
    let pwEng = password.search(/[a-z]/ig);
    let pwSpe = password.search(/[`~!@@#$%^&*|₩₩₩'₩";:₩/?]/gi);

    if((pwNum < 0 && pwEng < 0) || (pwNum < 0 && pwSpe < 0) || (pwEng < 0 && pwSpe < 0)) {
        return res.status(400).json({success: false, message: 'Password requires at least one character and one digit.'})
    }

    let SALT_FACTOR = 5;
    bcrypt.hash(password, SALT_FACTOR, (err, hash) => {
        if(err) {
            console.log('ERROR WHILE GENERATING PASSWORD', err);
        }
        console.log(hash);
        models.User.create({
            email: email,
            password: hash,
            name: name,
            gender: gender,
            birthYear: parseInt(birthYear),
            phone: phone,
            social: false,
        }).then(user => {
            return res.status(200).json({success: true, meesage: 'Ok'});
        }).catch(err => {
            if(err) res.status(500).json({
                success: false,
                message: 'Error while creating user row in db. check uniqueness of parameters'
            });
        });
    });
}

function loginOnetime (req, res) {
    const email = req.body.email;
    // const password = req.body.password;
    const secret = config.jwt_secret;

    if (!email) {
        return res.status(400).json({success: false, message: 'Email not given.'});
    }
    models.User.findOne({
        where: {
            email: email
        }
    }).then(user => {
        if(!user) {
            return res.status(403).json({success: false, message: 'No user account found with given email address.'});
        }
        jwt.sign({
                id: user.id,
                email: user.email,
                name: user.name
            },
            secret, {
                expiresIn: '7d',
                issuer: 'jellylab.io',
                subject: 'userInfo'
            }, (err, token, onetime ) => {
                console.log(`err: ${err}, token: ${token}, onetime : ${onetime}`);
                if(err) {
                    console.log(`err.message: ${err.message}`);
                    return res.status(403).json({
                        success: false,
                        message: err.message
                    });
                }
                console.log(`req.header.origin = ${req.header('origin')}`);

                const cookieMaxAge = 1000 * 60 * 60 * 24 * 7;

                if(req.header('origin') === undefined) {
                    console.log('req origin is undefined. Probably from postman.');
                    if(req.secure) {
                        console.log('req. is secure');
                        res.cookie('token', token, {maxAge: cookieMaxAge, secure: true});
                        res.cookie('onetime', '1', {maxAge: 900000, secure: false});
                    } else {
                        console.log('req is NOT secure');
                        res.cookie('token', token, {maxAge: cookieMaxAge, secure: false});
                        res.cookie('onetime', '1', {maxAge: 900000, secure: false});
                    }
                } else if(req.header('origin').includes('localhost')) {
                    console.log('req origin includes localhost OR it is from postman');
                    if(req.secure) {
                        console.log('req. is secure');
                        res.cookie('token', token, {maxAge: cookieMaxAge, secure: true});
                        res.cookie('onetime', '1', {maxAge: 900000, secure: false});
                    } else {
                        console.log('req is NOT secure');
                        res.cookie('token', token, {maxAge: cookieMaxAge, secure: false});
                        res.cookie('onetime', '1', {maxAge: 900000, secure: false});
                    }
                } else {
                    console.log('req origin does NOT include localhost');
                    if(req.secure) {
                        res.cookie('token', token, {maxAge: cookieMaxAge, secure: true});
                        res.cookie('onetime', '1', {maxAge: 900000, secure: false});
                    } else {
                        res.cookie('token', token, {maxAge: cookieMaxAge, secure: false});
                        res.cookie('onetime', '1', {maxAge: 900000, secure: false});
                    }
                }
                res.header('Access-Control-Allow-Credentials', 'true');
                return res.status(200).json({success: true, message: 'Ok', token: token, onetime: onetime, redirect: '/lobby'});
            });
                // } else {
                //     return res.status(403).json({
                //         success: false,
                //         message: 'Password wrong'
                //     });
                // }
            }).catch(err => {
        console.log(`err.message: ${err.message}`);
        return res.status(403).json({
            success: false,
            message: `DB error. err: ${err.message}`
        })
    });
}

// 수정 필요.
function login (req, res) {
    const email = req.body.email;
    const password = req.body.password;
    const secret = config.jwt_secret;

    console.log(req.body.email);
    console.log(req.body.password);
    res.clearCookie('onetime');
    if (!email) {
        return res.status(400).json({success: false, message: 'Email not given.'});
    }
    models.User.findOne({
        where: {
            email: email
        }
    }).then(user => {
        if(!user) {
            return res.status(403).json({success: false, message: 'No user account found with given email address.'});
        }
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if(err) {
                return res.status(403).json({
                    success: false,
                    message: 'Error while login'
                });
            } else {
                if (isMatch) {
                    jwt.sign({
                            id: user.id,
                            email: user.email,
                            name: user.name
                        },
                        secret, {
                            expiresIn: '7d',
                            issuer: 'jellylab.io',
                            subject: 'userInfo'
                        }, (err, token) => {
                            console.log(`err: ${err}, token: ${token}`);
                            if(err) {
                                console.log(`err.message: ${err.message}`);
                                return res.status(403).json({
                                    success: false,
                                    message: err.message
                                });
                            }
                            console.log(`req.header.origin = ${req.header('origin')}`);

                            const cookieMaxAge = 1000 * 60 * 60 * 24 * 7;

                            if(req.header('origin') === undefined) {
                                console.log('req origin is undefined. Probably from postman.');
                                if(req.secure) {
                                    console.log('req. is secure');
                                    res.cookie('token', token, {maxAge: cookieMaxAge, secure: true});
                                } else {
                                    console.log('req is NOT secure');
                                    res.cookie('token', token, {maxAge: cookieMaxAge, secure: false});
                                }
                            } else if(req.header('origin').includes('localhost')) {
                                console.log('req origin includes localhost OR it is from postman');
                                if(req.secure) {
                                    console.log('req. is secure');
                                    res.cookie('token', token, {maxAge: cookieMaxAge, secure: true});
                                } else {
                                    console.log('req is NOT secure');
                                    res.cookie('token', token, {maxAge: cookieMaxAge, secure: false});
                                }
                            } else {
                                console.log('req origin does NOT include localhost');
                                if(req.secure) {
                                    res.cookie('token', token, {maxAge: cookieMaxAge, secure: true});
                                } else {
                                    res.cookie('token', token, {maxAge: cookieMaxAge, secure: false});
                                }
                            }
                            res.header('Access-Control-Allow-Credentials', 'true');
                            return res.status(200).json({success: true, message: 'Ok', token: token, name: user.name, email: user.email, redirect: '/lobby'});
                        });
                } else {
                    return res.status(403).json({
                        success: false,
                        message: 'Password wrong'
                    });
                }
            }
        });
    }).catch(err => {
        console.log(`err.message: ${err.message}`);
        return res.status(403).json({
            success: false,
            message: `DB error. err: ${err.message}`
        });
    });
}

function socialLogin (req, res) {
    const email = req.body.email;
    const name = req.body.name;
    const token = req.body.token;
    const social = true;

    if (token) {
        models.User.findOne
        ({
            where: {
                email: email
            }
        }).then(user => {
            if (user) {
                if (user.social) {
                    return res.status(200).json({
                        success: true,
                        message: 'successfully social login',
                        redirect: '/lobby'
                    })
                } else {
                    return res.status(403).json({
                        success: false,
                        message: 'This email is Already signed up.'
                    });
                }
            } else {
                // DB에 등록
                models.User.create({
                    email: email,
                    name: name,
                    social: social,
                }).then(user => {
                    res.status(201).json({success: true, meesage: 'Ok', redirect: '/lobby'});
                }).catch(err => {
                    if(err) res.status(500).json({
                        success: false,
                        message: err.message,
                        log: 'Error while creating user row in db. check uniqueness of parameters'
                    });
                });
            }
        })
    } else {
        return res.status(403).send({
            success: false,
            message: 'No token given.'
        })
    }
}

function logout (req, res) {
    const cookie = req.cookie || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;
    const secret = config.jwt_secret;

    if (token) {
        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                return res.status(401).json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
            } else {
                res.clearCookie('token');
                const aftertoken = cookies.token;
                return res.status(200).json({ success: true });
            }
        });
    } else {
        res.clearCookie('token');
        return res.status(403).send({
            success: false,
            message: 'No token given'
        });
    }
}

function sendNewPassword (req, res) {
    const email = req.body.email;

    models.User.findOne({
        where: {
            email: email
        }
    }).then(user => {
        if (!user) {
            return res.status(404).json({success: false, message: 'No user account with given email address found'})
        } else {
            let newPassword = '';
            let SALT_FACTOR = 5;
            new Promise((resolve, reject) => {
                for (let i = 0; i < 9; i++) {
                    let rndVal = parseInt(Math.random() * 62);
                    if (rndVal < 10) newPassword += rndVal;
                    else if (rndVal > 35) newPassword += String.fromCharCode(rndVal + 61);
                    else newPassword += String.fromCharCode(rndVal + 55);
                }
            }).then(() => {
                console.log(newPassword);
            })
            bcrypt.hash(newPassword, SALT_FACTOR, function(err, hash) {
                if (err) {
                    return res.status(500).json({success: false, message: 'ERROR WHILE GENERATING PASSWORD'})
                }
                user.password = hash;
                user.save().then(_ => {
                    let transporter = nodemailer.createTransport({
                        service:'gmail',
                        auth: {
                            type: 'OAuth2',
                            user: 'support@jellylab.io',
                            clientId: '732880438602-u5pbho778b6i4bsvig2ma7v13n7hk4nb.apps.googleusercontent.com', //환경변수로 설정해 놓는 것을 권장합니다.
                            clientSecret: '6-XLCJjd-AWJ-qYkkBOO-CUr', //환경변수로 설정해 놓는 것을 권장합니다.
                            refreshToken: '1/jU0ghdET2MC5LMmJ0FpyG1CJRQNWGcmJ20Jvwh0pW-c', //환경변수로 설정해 놓는 것을 권장합니다.
                            accessToken: 'ya29.GlsOBsVLRfET8HR609HWOO65krRrwAJUFXbyROg6mrIG91NBFWL6sN3wz0KP71zp1LkxMQXKNcUf8RoLV-PnFkRIni-vA75BWLfXz2REQQVzmTxy4d_1IdmUpIGi', //환경변수로 설정해 놓는 것을 권장합니다.
                            expires: 3600
                        }
                    });
                    let mailOptions = {
                        from: '젤리랩 <support@jellylab.io>',
                        to: `${email}`,
                        subject: '변경된 임시 비밀번호를 전달해드립니다.',
                        html: `변경된 임시 비밀번호는 <b>${newPassword}</b>입니다. 임시 비밀번호로 로그인 후 비밀번호를 변경하여 이용 부탁드립니다.`
                    }

                    transporter.sendMail(mailOptions, function(err, info) {
                        if ( err ) {
                            console.error('Send Mail error : ', err);
                        } else {
                            console.log('Message sent : ', info);
                            return res.status(200).json({ success: true });
                        }
                    });
                })
            })
        }
    }).catch(err => {
        return res.status(403).json({success: false, message: 'Unknown outer catch error. err: ' + err.message})
    })
}

function sendInquiry (req, res) {
    const email = req.body.email;
    const name = req.body.name;
    const subject = req.body.subject;
    const message = req.body.message;

    models.User.findOne({
        where: {
            email: email
        }
    }).then(user => {
        if (!user) {
            return res.status(403).json({ success: false, message: 'ERROR WHILE FIND EMAIL'})
        } else {
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: 'support@jellylab.io',
                    clientId: '732880438602-u5pbho778b6i4bsvig2ma7v13n7hk4nb.apps.googleusercontent.com', //환경변수로 설정해 놓는 것을 권장합니다.
                    clientSecret: '6-XLCJjd-AWJ-qYkkBOO-CUr', //환경변수로 설정해 놓는 것을 권장합니다.
                    refreshToken: '1/jU0ghdET2MC5LMmJ0FpyG1CJRQNWGcmJ20Jvwh0pW-c', //환경변수로 설정해 놓는 것을 권장합니다.
                    accessToken: 'ya29.GlsOBsVLRfET8HR609HWOO65krRrwAJUFXbyROg6mrIG91NBFWL6sN3wz0KP71zp1LkxMQXKNcUf8RoLV-PnFkRIni-vA75BWLfXz2REQQVzmTxy4d_1IdmUpIGi', //환경변수로 설정해 놓는 것을 권장합니다.
                    expires: 3600
                }
            });

            let mailOptions = {
                from: `${email}`,
                to: 'support@jellylab.io',
                subject: subject,
                html: `<b>보낸이: ${name} ${email}</b><br><br>${message}`
            }

            transporter.sendMail(mailOptions, function(err, info) {
                if (err) {
                    console.error('Send Mail error : ', err);
                    return res.status(403).json({ success: false, message: err })
                } else {
                    console.log('Message sent : ', info);
                    return res.status(200).json({ success: true })
                }
            })
        }
    }).catch(errr => {
        return res.status(403).json({ success: false, message: 'Unknown outer catch error. err: ' + err.message })
    })
}
function memberWithdraw (req, res) {
    const cookie = req.cookie || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;
    const secret = config.jwt_secret;

    const email = req.body.email;
    const password = req.body.password;
    console.log(req.headers);

    if (token) {
        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                return res.status(401).json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
            } else {
                if (!email) return res.status(400).json({ success: false, message: 'Email not provided.'});
                models.User.find({
                    where: {
                        email: email
                    }
                }).then(user => {
                    if (!user) {
                        return res.status(403).json({ success: false, message: 'No user account with given email address found'})
                    } else {
                        // 소셜 로그인
                        if (user.social) {
                            models.User.destroy({
                                where: {
                                    email: email
                                }
                            }).then(result => {
                                console.log('User destroy result: ' + result);

                                if (result === 0) {
                                    return res.status(403).json({ success: false, message: 'User email and '})
                                } else {
                                    res.clearCookie('token');
                                    return res.status(200).json({ success: true, message: 'User account successfully deleted.', redirect: '/'});
                                }
                            }).catch(err => {
                                return res.status(403).json({ success: false, message: 'Unknown inner catch error on User destroy. err: ' + err.message});
                            })
                            // 일반 로그인
                        } else {
                            bcrypt.compare(password, user.password, (err, isMatch) => {
                                if (err) {
                                    return res.status(403).json({success: false, message: 'The given password does not match with the account password.' })
                                } else {
                                    if (isMatch) {
                                        models.User.destroy({
                                            where: {
                                                email: email,
                                                password: user.password
                                            }
                                        }).then(result => {
                                            console.log('User destroy result: ' + result);

                                            if (result === 0) {
                                                return res.status(403).json({ success: false, message: 'User email and password match. but somehow the delete failed.'});
                                            } else {
                                                res.clearCookie('token');
                                                return res.status(200).json({ success: true, message: 'User account successfully deleted.', redirect: '/'});
                                            }
                                        }).catch(err => {
                                            return res.status(403).json({ success: false, message: 'Unknown inner catch error on Doctor.destroy. err: ' + err.message});
                                        })
                                    } else {
                                        return res.status(403).json({ success: false, message: 'User email and password not match.'});
                                    }
                                }
                            })
                        }
                    }
                }).catch(err => {
                    return res.status(403).json({ success: false, message: 'Unknown outer catch error on User destroy. err: ' + err.message});
                })
            }
        })
    } else {
        res.clearCookie('token');
        return res.status(403).send({ success: false, message: 'No token given.' });
    }

}

function updatePassword (req, res) {
    const email = req.body.email;
    const curPassword = req.body.curPassword;
    const newPassword = req.body.newPassword;

    if (!email) return res.status(400).json({success: false, message: 'email not provided.'});

    // Check if newPassword arrived
    if (!newPassword.length) {
        return res.status(400).json({success: false, message: 'newPassword not given'});
    }

    // Check if newPassword > 8 alphanumeric
    if( newPassword.length < 8 ){
        return res.status(400).json({success: false, message: 'newPassword needs to be longer than 8 alphanumeric characters.'});
    }

    // Check if newPassword > 8 alphanumeric
    let pwNum = newPassword.search(/[0-9]/g);
    let pwEng = newPassword.search(/[a-z]/ig);
    let pwSpe = newPassword.search(/[`~!@@#$%^&*|₩₩₩'₩";:₩/?]/gi);
    let letter = /[a-zA-Z]/;
    let number = /[0-9]/;
    let valid = (pwNum < 0 && pwEng < 0) || (pwNum < 0 && pwSpe < 0) || (pwEng < 0 && pwSpe < 0) //match a letter _and_ a number
    if (valid){
        return res.status(400).json({success: false, message: 'newPassword requires at least one character and one digit.'})
    }

    models.User.findOne({
        where: {
            email: email
        }
    }).then(user => {
        if (!user) {
            return res.status(404).json({error: 'No user with given email address.'});
        }

        bcrypt.compare(curPassword, user.password, function(err, isMatch) {
            if(err) {
                return res.status(403).json({success: false, message: 'encryption error'})
            } else {
                if(isMatch) {
                    let SALT_FACTOR = 5;
                    bcrypt.hash(newPassword, SALT_FACTOR, function(err, hash) {
                        if(err) {
                            console.log('ERROR WHILE GENERATING PASSWORD',err);
                            return res.status(403).json({success: false, message: 'ERROR WHILE GENERATING PASSWORD'})
                        }
                        user.password = hash;
                        user.save().then(_ => {
                            return res.status(200).json({success: true, message: 'Password successfully updated.'})
                        })
                    });
                } else {
                    return res.status(403).json({success: false, message: 'Given current password is wrong.'})
                }
            }
        });
    });
}

function updateUser (req, res) {
    console.log('updateUser called.');
    let kakao_id;
    if (req.body){
        kakao_id = req.body.kakao_id;
        if (!kakao_id){
            return res.status(401).json({success: false, message: 'kakao_id not provided.'})
        }
    } else {
        return res.status(401).json({success: false, message: 'No input parameters received in body.'})
    }

    const name = req.body.name;
    const birthday = req.body.birthday;
    const sex = req.body.sex;
    const hate_food = req.body.hate_food;
    const vegi = req.body.vegi;
    const snack = req.body.snack;
    const serving_size = req.body.serving_size;
    const disease = req.body.disease;
    const diet = req.body.diet;
    const alone_level = req.body.alone_level;
    const job = req.body.job;
    const register = req.body.register;
    const subway = req.body.subway;
    const exit_quarter = req.body.exit_quarter;
    const rest_final = req.body.rest_final;
    const lat = req.body.lat;
    const lng = req.body.lng;
    const mid_lat = req.body.mid_lat;
    const mid_lng = req.body.mid_lng;
    const cnt = req.body.cnt;
    const limit_cnt = req.body.limit_cnt;
    const mood2 = req.body.mood2;
    const with_mood = req.body.with_mood;
    const taste = req.body.taste;
    const food_type = req.body.food_type;
    const chat_log = req.body.chat_log;
    const freq_subway = req.body.freq_subway;
    const drink_before = req.body.drink_before;
    const drink_type = req.body.drink_type;
    const drink_round = req.body.drink_round;

    const limit_cnt_drink = req.body.limit_cnt_drink;
    const cafe_before = req.body.cafe_before;
    const limit_cnt_cafe = req.body.limit_cnt_cafe;
    const mood1 = req.body.mood1;
    const subway_cafe = req.body.subway_cafe;
    const freq_subway_cafe = req.body.freq_subway_cafe;
    const mainmenu_type = req.body.mainmenu_type;
    const food_name = req.body.food_name;
    const price_lunch = req.body.price_lunch;
    const price_dinner = req.body.price_dinner;
    const cafe_final = req.body.cafe_final;

    if(name){
        // models.Medicine_time.create({
        //     kakao_id: kakao_id,
        //     encrypted_kakao_id: kakao_id,
        //     slot: 0,
        //     time: 5
        // });
        //
        // models.Medicine_time.create({
        //     kakao_id: kakao_id,
        //     encrypted_kakao_id: kakao_id,
        //     slot: 1,
        //     time: 12
        // });
        //
        // models.Medicine_time.create({
        //     kakao_id: kakao_id,
        //     encrypted_kakao_id: kakao_id,
        //     slot: 2,
        //     time: 17
        // });

        models.User.update({
            registered: 0,
            encrypted_kakao_id: kakao_id //todo: 카카오아이디 암호화
        }, {
            where: {
                kakao_id: kakao_id
            } // Condition
        }).then(result => {
            console.log('result: ' + result.toString())
            if (result){
                return res.status(200).json({success: true, message: 'Update registered complete. Result: ' + result.toString()})
            } else {
                return res.status(403).json({success: true, message: 'No user found to update or User does not exist with given kakao_id. ' +
                    + result.toString()})
            }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })

    }

    let param_name;
    let param_value;
    if (name){
        param_name = 'name';
        param_value = name;
    } else if (chat_log) {
        param_name = 'chat_log';
        if (String(chat_log).length > 1000000) {
          chat_log = null;
        }
        param_value = chat_log;
    } else if (birthday) {
        param_name = 'birthday';
        param_value = birthday;
    } else if (sex) {
        param_name = 'sex';
        param_value = sex;
    } else if (hate_food){
        param_name = 'hate_food';
        param_value = hate_food;
    } else if (vegi){
        param_name = 'vegi';
        param_value = vegi;
    } else if (snack) {
        param_name = 'snack';
        param_value = snack;
    }  else if (serving_size) {
        param_name = 'serving_size';
        param_value = serving_size;
    } else if (disease){
        param_name = 'disease';
        param_value = disease;
    } else if (diet){
        param_name = 'diet';
        param_value = diet;
    } else if (alone_level){
        param_name = 'alone_level';
        param_value = alone_level;
    } else if (job){
        param_name = 'job';
        param_value = job;
    } else if (subway){
        param_name = 'subway';
        param_value = subway;
    } else if (exit_quarter){
        param_name = 'exit_quarter';
        param_value = exit_quarter;
    } else if (rest_final){
        param_name = 'rest_final';
        param_value = rest_final;
    } else if (lat){
        param_name = 'lat';
        param_value = lat;
    } else if (lng){
        param_name = 'lng';
        param_value = lng;
    } else if (mid_lat){
        param_name = 'mid_lat';
        param_value = mid_lat;
    } else if (mid_lng){
        param_name = 'mid_lng';
        param_value = mid_lng;
    } else if (cnt){
        param_name = 'cnt';
        param_value = cnt;
    } else if(limit_cnt){
        param_name = 'limit_cnt';
        param_value = limit_cnt;
    } else if(mood2){
        param_name = 'mood2';
        param_value = mood2;
    } else if(mood1){
        param_name = 'mood1';
        param_value = mood1;
    } else if(with_mood) {
        param_name = 'with_mood';
        param_value = with_mood;
    } else if(taste){
        param_name = 'taste';
        param_value = taste;
    } else if(food_type){
        param_name = 'food_type';
        param_value = food_type;
    } else if(freq_subway){
        param_name = 'freq_subway';
        param_value = freq_subway;
    } else if(drink_before){
        param_name = 'drink_before';
        param_value = drink_before;
    } else if(drink_type){
        param_name = 'drink_type';
        param_value = drink_type;
    } else if(drink_round){
        param_name = 'drink_round';
        param_value = drink_round;
    } else if(limit_cnt_drink){
        param_name = 'limit_cnt_drink';
        param_value = limit_cnt_drink;
    } else if(limit_cnt_cafe){
        param_name = 'limit_cnt_cafe';
        param_value = limit_cnt_cafe;
    } else if(cafe_before){
        param_name = 'cafe_before';
        param_value = cafe_before;
    } else if(mainmenu_type){
        param_name = 'mainmenu_type';
        param_value = mainmenu_type;
    } else if(subway_cafe){
        param_name = 'subway_cafe';
        param_value = subway_cafe;
    } else if(freq_subway_cafe){
        param_name = 'freq_subway_cafe';
        param_value = freq_subway_cafe;
    } else if(food_name){
        param_name = 'food_name';
        param_value = food_name;
    } else if(price_lunch){
        param_name = 'price_lunch';
        param_value = price_lunch;
    } else if(price_dinner){
        param_name = 'price_dinner';
        param_value = price_dinner;
    }
    else if (cafe_final){
        param_name = 'cafe_final';
        param_value = cafe_final;
    }

    if (param_value === null || param_value === '') {
      console.log("###########################################################");
    }

    if (param_name === 'chat_log') {
      // query = `UPDATE users SET chat_log = '${param_value}', chat_log_jellylab = '${param_value}' WHERE kakao_id = '${kakao_id}';`;
      // console.log("Query : " + query);
      models.User.update(
        {chat_log: param_value,
          chat_log_jellylab: param_value,
        },
           {where: {
             kakao_id: kakao_id}}).then(result => {
      //models.sequelize.query(`UPDATE users SET chat_log = '${param_value}', chat_log_jellylab = '${param_value}' WHERE kakao_id = '${kakao_id}';`).then(result => {
          if (result){
            if (param_name !== 'chat_log') {
              console.log('result: ' + result.toString() + '끝');
            }
              return res.status(200).json({success: true, message: 'user data updated. Result info: ' + result[0].info})
          } else {
              return res.status(403).json({success: false, message: 'user update query failed.'})
          }
      }).catch(function (err){
        return res.status(500).json({success: false, message: 'Internal Server or Database Error1. err: ' + err.message})
      })
    } else {
      if (param_value){
        if (param_value == 'null') {
          models.sequelize.query(`UPDATE users SET ${param_name} = NULL WHERE kakao_id = '${kakao_id}';`).then(result => {
              if (result){
                if (param_name !== 'chat_log') {
                  console.log('result: ' + result.toString() + '끝');
                }
                  return res.status(200).json({success: true, message: 'user data updated. Result info: ' + result[0].info})
              } else {
                  return res.status(403).json({success: false, message: 'user update query failed.'})
              }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error2. err: ' + err.message})
          })
        } else {
          models.sequelize.query(`UPDATE users SET ${param_name} = '${param_value}' WHERE kakao_id = '${kakao_id}';`).then(result => {
              if (result){
                if (param_name !== 'chat_log') {
                  console.log('result: ' + result.toString() + '끝');
                }
                  return res.status(200).json({success: true, message: 'user data updated. Result info: ' + result[0].info})
              } else {
                  return res.status(403).json({success: false, message: 'user update query failed.'})
              }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error3. err: ' + err.message})
          })
        }
        //  models.sequelize.query('UPDATE users SET ' + param_name + " = '" + param_value + "' WHERE kakao_id = '" + kakao_id + "';").then(result => {
      } else {
          return res.status(401).json({success: false, message: 'No parameter given. Please check again. Required: kakao_id. ' +
              'And one more parameter is required among name, initials, user_code, email, phone, sex, birthday'})
      }
    }
}

function getRestaurant (req, res) {
  const kakao_id = req.body.kakao_id;
  let subway = req.body.subway;
  let exit_quarter = req.body.exit_quarter;

  let mood2 = req.body.mood2;
  let food_type = req.body.food_type;
  let taste = req.body.taste;
  let hate_food = req.body.hate_food; //taste, food_name에 모두 반영
  let food_ingre = req.body.food_ingre;
  let price_lunch = req.body.price_lunch;
  let price_dinner = req.body.price_dinner;
  console.log('price_lunch, price_dinner0:'+price_lunch+price_dinner);
  let subway_flag = '';
  let taste_flag = '';
  let food_type_flag = '';
  let mood2_flag = '';
  let price_lunch_flag = '';
  let price_dinner_flag = '';
    console.log('price_lunch, price_dinner1:'+price_lunch+price_dinner);
  // 특정 역을 입력하므로 일단은 안 쓰임
  if(subway === '서울 어디든 좋아' || subway === null){
    subway = 'x';
    subway_flag = 'NOT';
  }

  if(exit_quarter.includes('999')){
    exit_quarter = '1,2,3,4';
  }

  if(price_dinner === 'x'){ //점심식사
      price_lunch= price_lunch.replace(/,/g,' ');
      price_dinner_flag = 'NOT'
  } else if (price_lunch === 'x') { //저녁식사
      price_dinner = price_dinner.replace(/,/g, ' ');
      price_lunch_flag = 'NOT'
  }
    console.log('price_lunch, price_dinner2:'+price_lunch+price_dinner);
    console.log(`price_lunch_flag : ${price_lunch_flag}, price_dinner_flag : ${price_dinner_flag}`);
    console.log(`mood2 : ${mood2}`);
  // 일상적인 식사일 경우에는 mood2 고려 안 함
  // 일상적인 식사가 아닌 경우에는 keyword를 공백을 두어 문자열로 만듦
  if(mood2 === '999' || mood2 === '998'){
    mood2_flag = 'NOT';
    mood2 = 'x';
  } else{
  // 밥 약속이나 술 약속인 경우 keyword를 공백을 두어 문자열로 만듦
    mood2= mood2.replace(/,/g,' ');
  }

  // !-가벼운 == 헤비한 이므로, 예를 들어 헤비한 음식을 고른 경우에는 flag를 not으로 만들어서 가벼운 음식을 제외
  if(taste.includes('!-')){
    taste = taste.replace('!-','');
    taste_flag = 'NOT';
  } else if(taste === 'all'){
    taste = 'x';
    taste_flag = 'NOT';
  }

  if(hate_food === null){
      hate_food = 'x';
  }
  hate_food = hate_food.replace(/,/g,' ');

  food_type = food_type.replace(/,/g,' ');

  if(food_type === '이국적'){
    food_type = '한식 일식 중식 양식';
    food_type_flag = 'NOT';
  } else if(food_type === 'all'){
    food_type = 'x';
    food_type_flag = 'NOT';
  }

  if(food_ingre === null){
    food_ingre = 'x';
  }

  console.log('hate_food:'+hate_food);

    // NOT (match(taste) against('${hate_food}' in boolean mode)) AND
    // NOT (match(food_name) against('${hate_food}' in boolean mode)) AND
  models.sequelize.query(`SELECT * FROM restaurants WHERE
   ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
  (exit_quarter IN (${exit_quarter})) AND
  ${price_lunch_flag} (match(price_lunch) against('${price_lunch}' in boolean mode)) AND
  ${price_dinner_flag} (match(price_dinner) against('${price_dinner}' in boolean mode)) AND
   ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
  NOT (match(food_ingre) against('${food_ingre}' in boolean mode)) AND
  NOT (match(food_name) against('${hate_food}' in boolean mode)) AND
   ${taste_flag} (match(taste) against('"${taste}" -${hate_food}' in boolean mode)) AND
   ${food_type_flag} (match(food_type) against('${food_type}' in boolean mode))
ORDER BY RAND() LIMIT 2;`).then(result => {
      if (result[0].length === 2){
          console.log('result: ' + result.toString())
          return res.status(200).json({success: true, try: 1, message: result[0]})
      } else {
        models.sequelize.query(`SELECT * FROM restaurants WHERE
         ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
        (exit_quarter IN (1,2,3,4)) AND
         ${price_lunch_flag} (match(price_lunch) against('${price_lunch}' in boolean mode)) AND
         ${price_dinner_flag} (match(price_dinner) against('${price_dinner}' in boolean mode)) AND
         ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
        NOT (match(food_ingre) against('${food_ingre}' in boolean mode)) AND
        NOT (match(food_name) against('${hate_food}' in boolean mode)) AND
         ${taste_flag} (match(taste) against('"${taste}" -${hate_food}' in boolean mode)) AND
         ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
         ${food_type_flag} (match(food_type) against('${food_type}' in boolean mode))
      ORDER BY RAND() LIMIT 2;`).then(second_result => {
        if (second_result[0].length === 2) {
          console.log('second result: ' + second_result.toString())
          return res.status(200).json({success: true, try: 2, message: second_result[0]})
        } else {
          return res.status(200).json({success: false, message: 'no result.'})
        }
      }).catch( err => {
            console.log('price_lunch, price_dinner4:'+price_lunch+price_dinner);
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    }
  }).catch( err => {
      console.log('price_lunch, price_dinner5:'+price_lunch+price_dinner);
    return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  });
}

function getTwoRestaurant (req, res) {
    const kakao_id = req.body.kakao_id;
    const rest1 = req.body.rest1;
    const rest2 = req.body.rest2;

    models.sequelize.query('SELECT * FROM restaurants WHERE id= '+rest1+' UNION ALL SELECT * FROM restaurants WHERE id= '+rest2+';').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
    //}
}

function getAllHistory (req, res) {
    const kakao_id = req.body.kakao_id;

    models.User.findOne({
        attributes: ['email'],
        where: {
            kakao_id: kakao_id
        }
    }).then(user_email => {
      if(user_email){
        models.sequelize.query('SELECT * FROM decide_histories WHERE email = '+"'"+user_email.email+"'"+' ORDER BY id DESC;').then(result => {
            if (result){
                console.log('result: ' + result.toString())
                return res.status(200).json({success: true, message: result[0]})
            } else {
                console.log('result없음');
                return res.status(403).json({success: false, message: 'user update query failed.'})
            }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      }else{
        return res.status(401).json({message: 'Cant find user email : ' + err.message})
      }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function getSubwayHistory (req, res) {
    const kakao_id = req.body.kakao_id;
    const subway = req.body.subway;

    models.User.findOne({
        attributes: ['email'],
        where: {
            kakao_id: kakao_id
        }
    }).then(user_email => {
      if(user_email){
        models.sequelize.query('SELECT * FROM decide_histories WHERE email = '+"'"+user_email.email+"'"+' AND subway = '+"'"+subway+"'"+' ORDER BY id;').then(result => {
            if (result){
                console.log('result: ' + result.toString())
                return res.status(200).json({success: true, message: result[0]})
            } else {
                console.log('result없음');
                return res.status(403).json({success: false, message: 'no result'})
            }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      }else{
        return res.status(401).json({message: 'Cant find user email : ' + err.message})
      }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function getCountHistory (req, res) {
    const kakao_id = req.body.kakao_id;

    models.User.findOne({
        attributes: ['email'],
        where: {
            kakao_id: kakao_id
        }
    }).then(user_email => {
      if(user_email){
        models.sequelize.query('SELECT *,count(*) as cnt FROM decide_histories WHERE email = '+"'"+user_email.email+"'"+' GROUP BY res_name ORDER BY cnt DESC;').then(result => {
            if (result){
                console.log('result: ' + result.toString())
                return res.status(200).json({success: true, message: result[0]})
            } else {
                console.log('result없음');
                return res.status(403).json({success: false, message: 'no result'})
            }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      }else{
        return res.status(401).json({message: 'Cant find user email : ' + err.message})
      }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function updateSocket (req, res) {
    const email = req.body.email
    const socket_id = req.body.socket_id;

    models.User.update(
        {
            kakao_id: socket_id,
        },     // What to update
        {where: {
                email: email},
                silent: true
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'User Socket Update complete.', email: email})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
    //}
}

function updatePartLog (req, res) {
    const chat_log = req.body.chat_log;
    const emailValue = req.body.email;
    const targetcol = req.body.col;

    if (String(chat_log).length > 1000000) {
      chat_log = null;
    }

    models.User.update(
        {
            [targetcol]: chat_log,
        },     // What to update
        {where: {
                email: emailValue},
                logging: false
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'User Socket Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
    //}
}


function updateChatLog (req, res) {
    const chat_log = req.body.chat_log;
    const socket_id = req.body.socket_id;

    if (String(chat_log).length > 1000000) {
      chat_log = null;
    }

    models.User.update(
        {
            chat_log: chat_log,
            chat_log_jellylab: chat_log,
        },     // What to update
        {where: {
                kakao_id: socket_id},
                logging: false
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'User Socket Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
    //}
}


function getUserInfo (req, res) {
    console.log('getUserInfo called.')
    const kakao_id = req.params.kakao_id
    let nowDate = new Date();
    nowDate.getTime();
    const now = nowDate;

    if (kakao_id) {
        models.User.findOne({
            where: {
                kakao_id: kakao_id
            }
        }).then(user => {
            if (!user){
                return res.status(403).json({success: false, message: 'user not found with kakao_id: ' + kakao_id})
            }
            models.UserLog.findAll({
                where: {
                    kakao_id: kakao_id
                },
                order: [
                    // Will escape username and validate DESC against a list of valid direction parameters
                    ['id', 'DESC']
                ]
            }).then(userLog => {
                console.log('userLog findAll finished.')
                if (userLog){
                    //console.log(userLog);
                    models.User.update({
                        exit: 0,
                        //updated_at: now
                    }, {
                        where: {kakao_id: kakao_id} // Condition
                    })
                    return res.status(200).json({success: true, message: 'user and user_log both found.', user_info: user, user_log: userLog})
                } else {
                    // Return when no data found
                    return res.status(403).json({success: false, message: 'No userLog found with given kakao_id.'})
                }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
            })
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
    } else {
        return res.status(401).json({success: false, message: 'kakao_id not given.'})
    }
}

function getUserInfoByEmail (req, res) {
    console.log('getUserInfo called.')
    const email = req.params.email;
    let nowDate = new Date();
    nowDate.getTime();
    const now = nowDate;

    if (email) {
        models.User.findOne({
            where: {
                email: email
            }
        }).then(user => {
            if (!user){
                return res.status(403).json({success: false, message: 'user not found with email: ' + email})
            }
            models.UserLog.findAll({
                where: {
                    email: email
                },
                order: [
                    // Will escape username and validate DESC against a list of valid direction parameters
                    ['id', 'DESC']
                ]
            }).then(userLog => {
                console.log('userLog findAll finished.')
                if (userLog){
                    //console.log(userLog);
                    models.User.update({
                        exit: 0,
                        //updated_at: now
                    }, {
                        where: {email: email} // Condition
                    })
                    return res.status(200).json({success: true, message: 'user and user_log both found.', user_info: user, user_log: userLog})
                } else {
                    // Return when no data found
                    return res.status(403).json({success: false, message: 'No userLog found with given email.'})
                }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
            })
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
    } else {
        return res.status(401).json({success: false, message: 'email not given.'})
    }
}

function getRestaurantInfo (req, res) {
    console.log('getRestaurantInfo called.')
    const id = req.body.id

    models.sequelize.query('SELECT * FROM restaurants WHERE id= '+id+';').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'no result.'})
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
    //}
}

function getCafeInfo (req, res) {
    console.log('getCafeInfo called.')
    const id = req.body.id

    models.sequelize.query('SELECT * FROM cafes WHERE id= '+id+';').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'no result.'})
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
    //}
}

function updateUserStart (req, res) {
    console.log('updateUserStart called.')
    const kakao_id = req.body.kakao_id;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            subway: null,
            freq_subway: null,
            exit_quarter: null,
            with_mood: null,
            rest1: null,
            rest2: null,
            cafe1: null,
            cafe2: null,
            taste: null,
            food_type: null,
            hate_food: null,
            mood2: null
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'UserStart Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updatePlaceStart (req, res) {
    console.log('updatePlaceStart called.')
    const kakao_id = req.body.kakao_id;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            price_lunch: null,
            price_dinner: null,
            hate_food: null,
            lat: 0,
            lng: 0,
            mid_lat: 0,
            mid_lng: 0,
            cnt: 0
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'UserStart Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updateDrinkStart (req, res) {
    console.log('updateDrinkStart called.')
    const kakao_id = req.body.kakao_id;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            mood2: null,
            rest1: null,
            rest2: null,
            taste: null,
            drink_type: null,
            drink_round: null,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'UserDrinkStart Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updateCafeStart (req, res) {
    console.log('updateCafeStart called.')
    const kakao_id = req.body.kakao_id;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            mood1: null,
            cafe1: null,
            cafe2: null,
            mainmenu_type: null,
            food_name: null,
            mood2: null,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'UserCafeStart Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updateRest2 (req, res) {
    console.log('updateRest called.')
    const kakao_id = req.body.kakao_id;
    const rest1 = req.body.rest1;
    const rest2 = req.body.rest2;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            rest1: rest1,
            rest2: rest2,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'UserRest2 Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updateCafe2 (req, res) {
    console.log('updateCafe called.')
    const kakao_id = req.body.kakao_id;
    const cafe1 = req.body.cafe1;
    const cafe2 = req.body.cafe2;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            cafe1: cafe1,
            cafe2: cafe2,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'UserCafe2 Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updatePlaceInfo (req, res) {
    console.log('updatePlaceInfo called.')
    const kakao_id = req.body.kakao_id;
    const lat = req.body.lat;
    const lng = req.body.lng;
    const cnt = req.body.cnt;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            lat: lat,
            lng: lng,
            cnt: cnt
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'updatePlaceInfo Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updateMidInfo (req, res) {
    console.log('updateMidInfo called.')
    const kakao_id = req.body.kakao_id;
    const mid_lat = req.body.mid_lat;
    const mid_lng = req.body.mid_lng;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            mid_lat: mid_lat,
            mid_lng: mid_lng,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'updatePlaceInfo Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function createDecideHistory (req, res) {
    const kakao_id = req.body.kakao_id;
    const rest1 = req.body.rest1;
    const rest2 = req.body.rest2;
    const rest_winner = req.body.rest_winner;
    const res_name = req.body.res_name;
    const subway = req.body.subway;
    // let nowDate = new Date();
    const date = moment().format('YYYYMMDD');

    models.User.findOne({
        attributes: ['email'],
        where: {
            kakao_id: kakao_id
        }
    }).then(user_email => {
      if(user_email){
        models.Decide_history.create({
            email: user_email.email,
            rest1: rest1,
            rest2: rest2,
            rest_winner: rest_winner,
            res_name: res_name,
            subway: subway,
            date: date
        })
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'DecideHistory Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      }else{
        return res.status(401).json({message: 'Cant find user email : ' + err.message})
      }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function createUserFeedback (req, res) {
    const kakao_id = req.body.kakao_id;
    const sex = req.body.sex;
    const birthday = req.body.birthday;
    const job = req.body.job;
    const feedback_content = req.body.feedback_content;
    let nowDate = new Date();
    const date = moment().format('YYYYMMDD');


    models.User_feedback.create({
        kakao_id: kakao_id,
        encrypted_kakao_id: kakao_id,
        sex: sex,
        birthday: birthday,
        job: job,
        feedback_content: feedback_content,
        date: date
    })
    .then(result => {
      if (result) {
        return res.status(200).json({success: true, message: 'UserFeedback Create complete.'})
      } else {
        return res.status(403).json({success: false, message: 'no result'})
      }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function getFeedbackInfo (req, res) {
    console.log('getFeedbackInfo called.')

    models.sequelize.query('SELECT * FROM user_feedbacks;').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'no result'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    })
    //}
}

function createUserLog (req, res){
    const kakao_id = req.body.kakao_id
    const scenario = req.body.scenario
    const state = req.body.state
    const content = req.body.content
    let date = moment().format('YYYY-MM-DD HH:mm');
    const type = req.body.type
    const answer_num = req.body.answer_num
    //let nowDate = new Date();
    //nowDate.getTime();
    //const now = nowDate;

    models.UserLog.create({
        kakao_id: kakao_id,
        encrypted_kakao_id: kakao_id,
        scenario: scenario,
        state: state,
        content: content,
        date: date,
        type: type,
        answer_num: answer_num
    }).then(userLog => {
      if (userLog) {
        return res.status(200).json({success: true, message: 'User Log and User both Update complete.'})
      } else {
        return res.status(403).json({success: false, message: 'no result'})
      }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
}

function updateLimitCnt (req, res) {
    console.log('updateMidInfo called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt = req.body.limit_cnt;
    const date = moment().format();

    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    if (limit_cnt === 1) {
      models.User.update(
          {
              limit_cnt: limit_cnt,
              decide_updated_at: date,
          },     // What to update
          {where: {
                  kakao_id: kakao_id}
          })  // Condition
          .then(result => {
            if (result) {
              return res.status(200).json({success: true, message: 'updateLimitCnt Update complete.'})
            } else {
              return res.status(403).json({success: false, message: 'no result'})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    } else {
      models.User.update(
          {
              limit_cnt: limit_cnt,
          },     // What to update
          {where: {
                  kakao_id: kakao_id}
          })  // Condition
          .then(result => {
            if (result) {
              return res.status(200).json({success: true, message: 'updateLimitCnt Update complete.'})
            } else {
              return res.status(403).json({success: false, message: 'no result'})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    }
}

function verifyLimit (req, res) { // 30분 당 5회 제한 판별 API함수
    console.log('verifyLimit called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt = req.body.limit_cnt; //현재 유저DB의 메뉴결정 횟수
    let decide_updated_at = req.body.decide_updated_at; //현재 유저의 마지막 메뉴결정 시간
    const now_time = moment();
    const last_select_min = now_time.diff(decide_updated_at, 'minutes');

    if (decide_updated_at === null) {
      decide_updated_at = '2000-01-01 00:00:00';
    }

    /*
    음식점 선택 횟수(limit_cnt)가 5이고 decide_updated_at이 null이 아닐 때(신규가입 유저 고려),
      마지막 선택 시간으로부터 30분이 지나면,
        음식점 선택 횟수를 0으로 초기화하고 시나리오 진행 가능(success)
      마지막 선택 시간으로부터 30분이 지나지 않았으면,
        시나리오 진행 불가(failed)
    음식점 선택 횟수가 5가 아닐 때,
      마지막 선택 시간으로부터 30분이 지나면,
        음식점 선택 횟수를 0으로 초기화하고 시나리오 진행 가능(success)
      마지막 선택 시간으로부터 30분이 지나지 않았으면,
        시나리오 진행 가능(success)
    */
    if (limit_cnt === 5) {
      if (last_select_min > 30) {
        models.User.update(
            {
                limit_cnt: 0,
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
              if (result) {
                return res.status(200).json({result: 'success'})
              } else {
                return res.status(403).json({success: false, message: 'no result'})
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      } else {
        return res.status(200).json({result: 'failed'})
      }
    } else {
      if (last_select_min > 30) {
        models.User.update(
            {
                limit_cnt: 0,
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
              if (result) {
                return res.status(200).json({result: 'success'})
              } else {
                return res.status(403).json({success: false, message: 'no result'})
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      } else {
        return res.status(200).json({result: 'success'})
      }
    }
}

function updateLimitCntDrink (req, res) {
    console.log('updateMidInfo called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt_drink = req.body.limit_cnt_drink;
    const date = moment().format();

    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    if (limit_cnt_drink === 1) {
      models.User.update(
          {
              limit_cnt_drink: limit_cnt_drink,
              decide_updated_at_drink: date,
          },     // What to update
          {where: {
                  kakao_id: kakao_id}
          })  // Condition
          .then(result => {
            if (result) {
              return res.status(200).json({success: true, message: 'updateLimitCntDrink Update complete.'})
            } else {
              return res.status(403).json({success: false, message: 'no result'})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    } else {
      models.User.update(
          {
              limit_cnt_drink: limit_cnt_drink,
          },     // What to update
          {where: {
                  kakao_id: kakao_id}
          })  // Condition
          .then(result => {
            if (result) {
              return res.status(200).json({success: true, message: 'updateLimitCntDrink Update complete.'})
            } else {
              return res.status(403).json({success: false, message: 'no result'})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    }
}

function verifyLimitDrink (req, res) { // 30분 당 5회 제한 판별 API함수
    console.log('verifyLimitDrink called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt_drink = req.body.limit_cnt_drink; //현재 유저DB의 메뉴결정 횟수
    let decide_updated_at_drink = req.body.decide_updated_at_drink; //현재 유저의 마지막 메뉴결정 시간
    const now_time = moment();
    const last_select_min = now_time.diff(decide_updated_at_drink, 'minutes');

    if (decide_updated_at_drink === null) {
      decide_updated_at_drink = '2000-01-01 00:00:00';
    }

    /*
    음식점 선택 횟수(limit_cnt)가 5이고 decide_updated_at이 null이 아닐 때(신규가입 유저 고려),
      마지막 선택 시간으로부터 30분이 지나면,
        음식점 선택 횟수를 0으로 초기화하고 시나리오 진행 가능(success)
      마지막 선택 시간으로부터 30분이 지나지 않았으면,
        시나리오 진행 불가(failed)
    음식점 선택 횟수가 5가 아닐 때,
      마지막 선택 시간으로부터 30분이 지나면,
        음식점 선택 횟수를 0으로 초기화하고 시나리오 진행 가능(success)
      마지막 선택 시간으로부터 30분이 지나지 않았으면,
        시나리오 진행 가능(success)
    */
    if (limit_cnt_drink === 5) {
      if (last_select_min > 30) {
        models.User.update(
            {
                limit_cnt_drink: 0,
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
              if (result) {
                return res.status(200).json({result: 'success'})
              } else {
                return res.status(403).json({success: false, message: 'no result'})
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      } else {
        return res.status(200).json({result: 'failed'})
      }
    } else {
      if (last_select_min > 30) {
        models.User.update(
            {
                limit_cnt_drink: 0,
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
              if (result) {
                return res.status(200).json({result: 'success'})
              } else {
                return res.status(403).json({success: false, message: 'no result'})
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      } else {
        return res.status(200).json({result: 'success'})
      }
    }
}

function updateLimitCntCafe (req, res) {
    console.log('updateMidInfo called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt_cafe = req.body.limit_cnt_cafe;
    const date = moment().format();

    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    if (limit_cnt_cafe === 1) {
      models.User.update(
          {
              limit_cnt_cafe: limit_cnt_cafe,
              decide_updated_at_cafe: date,
          },     // What to update
          {where: {
                  kakao_id: kakao_id}
          })  // Condition
          .then(result => {
            if (result) {
              return res.status(200).json({success: true, message: 'updateLimitCntCafe Update complete.'})
            } else {
              return res.status(403).json({success: false, message: 'no result'})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    } else {
      models.User.update(
          {
              limit_cnt_cafe: limit_cnt_cafe,
          },     // What to update
          {where: {
                  kakao_id: kakao_id}
          })  // Condition
          .then(result => {
            if (result) {
              return res.status(200).json({success: true, message: 'updateLimitCntCafe Update complete.'})
            } else {
              return res.status(403).json({success: false, message: 'no result'})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    }
}

function verifyLimitCafe (req, res) { // 30분 당 5회 제한 판별 API함수
    console.log('verifyLimitCafe called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt_cafe = req.body.limit_cnt_cafe; //현재 유저DB의 메뉴결정 횟수
    let decide_updated_at_cafe = req.body.decide_updated_at_cafe; //현재 유저의 마지막 메뉴결정 시간
    const now_time = moment();
    const last_select_min = now_time.diff(decide_updated_at_cafe, 'minutes');

    if (decide_updated_at_cafe === null) {
      decide_updated_at_cafe = '2000-01-01 00:00:00';
    }

    /*
    음식점 선택 횟수(limit_cnt)가 5이고 decide_updated_at이 null이 아닐 때(신규가입 유저 고려),
      마지막 선택 시간으로부터 30분이 지나면,
        음식점 선택 횟수를 0으로 초기화하고 시나리오 진행 가능(success)
      마지막 선택 시간으로부터 30분이 지나지 않았으면,
        시나리오 진행 불가(failed)
    음식점 선택 횟수가 5가 아닐 때,
      마지막 선택 시간으로부터 30분이 지나면,
        음식점 선택 횟수를 0으로 초기화하고 시나리오 진행 가능(success)
      마지막 선택 시간으로부터 30분이 지나지 않았으면,
        시나리오 진행 가능(success)
    */
    if (limit_cnt_cafe === 5) {
      if (last_select_min > 30) {
        models.User.update(
            {
                limit_cnt_cafe: 0,
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
              if (result) {
                return res.status(200).json({result: 'success'})
              } else {
                return res.status(403).json({success: false, message: 'no result'})
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      } else {
        return res.status(200).json({result: 'failed'})
      }
    } else {
      if (last_select_min > 30) {
        models.User.update(
            {
                limit_cnt_cafe: 0,
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
              if (result) {
                return res.status(200).json({result: 'success'})
              } else {
                return res.status(403).json({success: false, message: 'no result'})
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        });
      } else {
        return res.status(200).json({result: 'success'})
      }
    }
}

function updateState (req, res) {
    const kakao_id = req.body.kakao_id;
    const scenario = req.body.scenario;
    const state = req.body.state;

    models.User.update(
        {
            scenario: scenario,
            state: state
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'User State Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
    //}
}

function updateStateEmail (req, res) {
    const emailValue = req.body.email;

    models.User.update(
        {
            scenario: '100',
            state: 'init'
        },     // What to update
        {where: {
                email: emailValue}
        })  // Condition
        .then(result => {
          if (result) {
            return res.status(200).json({success: true, message: 'User State Update complete.'})
          } else {
            return res.status(403).json({success: false, message: 'no result'})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
    //}
}

function getAllSubway(req, res) {
    models.Restaurant.findAll({
        attributes: ['subway'],
        group: 'subway'
    }).then(result => {
        let term = req.query.term;
        console.log( `term : ${term}`);
        if(result){
            let subway_array = result.reduce((acc,cur) => {
              acc.push(cur.subway);
              return acc;
            },[]);
            let result_array = subway_array.reduce((acc, cur) => {
              if (Hangul.search(cur, term, true) === 0) acc.push(cur);
              return acc;
            }, []);

            return res.status(200).json(result_array);
            // return '됨';
        }else{
            return res.status(403).json({error: 'no result'});
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function getAllRestsaurant(req, res) {
    models.Restaurant.findAll({
        attributes: ['res_name','subway'],
        group: ['res_name', 'subway']
    }).then(result => {
        if(result){
            let result_array = result.reduce((acc,cur) => {
              acc.push(cur.subway + ' ' + cur.res_name);
              return acc;
            },[]);
            return res.status(200).json(result_array);
            // return '됨';
        }else{
            return res.status(404).json({error: 'no result'});
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function getSimilarRestaurant (req, res) {
  const rest = req.body.rest;
  console.log(`getSimilarRestaurant에서 rest : ${rest}`);
  models.sequelize.query(`select * from restaurants where id = ${rest}`).then(result => {
    if (result[0].length !== 0) {
      console.log(" ----------- Query Change ----------");
      models.sequelize.query(`select * from restaurants where subway = '${result[0][0].subway}' and food_type = '${result[0][0].food_type}' and match(price_dinner) against('${result[0][0].price_dinner}') AND id != '${rest}' ORDER BY RAND() LIMIT 2;`).then(result2 => {
        if(result2[0].length >= 2){
          return res.status(200).json({success: true, message: result2[0]});
        } else {
          return res.status(200).json({success: false, message: 'no result.'});
        }
      }).catch(function (err) {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
      });
    } else {
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    }
  }).catch(function (err) {
    return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  });
}

function verifySubway (req, res) {
    console.log("here is verifYSubway");
    let subway;
    if ((req.body.subway !== undefined)){
        subway = req.body.subway;
    } else {
        return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (subway).',
            subway: req.body.subway});
    }

    models.Restaurant.findOne({
        where: {
            subway: subway
        }
    }).then(result => {
        if(result !== null) {
            res.status(200).json({result: 'success'})
        } else {
            res.status(200).json({result: 'no subway'})
        }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function verifySearchFood (req, res) {
    console.log("here is verifySearchFood");
    let search_food;
    console.log("req.body.search_food: "+req.body.search_food);
    if ((req.body.search_food !== undefined)){
        search_food = req.body.search_food;
    } else {
        return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (search_food).',
            search_food: req.body.search_food});
    }
    let subway;
    if ((req.body.subway !== undefined)){
        subway = req.body.subway;
    } else {
        return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (subway).',
            subway: req.body.subway});
    }
    // models.sequelize.query(`SELECT * FROM restaurants WHERE
    //  (match(food_type, food_name, res_name, taste) against('${search_food}*' in boolean mode));`
    models.Restaurant.findOne({
        where: {
            food_name: search_food,
            subway: subway
        }
    }).then(result => {
        if(result !== null) {
            res.status(200).json({result: 'success'})
        } else {
            res.status(200).json({result: 'no food in this subway'})
        }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

/*
function testSubwayExist (req, res) {
  console.log("here is testSubwayExist.");
  let subway;
  if ((req.body.subway !== undefined)) {
    subway = req.body.subway;
  } else {
    return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (subway).',
        subway: req.body.subway});
  }
  models.Cafe.findOne({
      where: {
          subway: subway
      }
  }).then(result => {
      if(result !== null) {
          res.status(200).json({result: 'success'})
      } else {
          res.status(200).json({result: 'no subway'})
      }
  }).catch(err => {
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  });
}*/

function verifySubwayDrinktype (req, res) {
    let subway;
    if ((req.body.subway !== undefined)){
        subway = req.body.subway;
    } else {
        return res.status(401).json({success: false, message: 'Parameters not properly given. Check parameter names (subway).',
            subway: req.body.subway});
    }

    models.Restaurant.findOne({
        where: {
            subway: subway,
            drink_type: {
              [Op.ne]: null
            }
        }})
        .then(result => {
        if(result !== null) {
            res.status(200).json({result: 'success'})
        } else {
            res.status(200).json({result: 'no subway'})
        }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function verifySubwayThema (req, res) {
    const subway = req.body.subway;
    models.Cafe.findAll({
      where: {
        subway: subway
      }
    }).then(result => {
        if(result){
            let subway_array = result.reduce((acc,cur) => {
              // acc.push(cur.mainmenu_type);
              acc.push(cur);
              return acc;
            },[]);
            let result_array = subway_array.reduce((acc, cur) => {
              if (Hangul.search(cur.mainmenu_type, '테마', true) === 0) acc.push(cur);
              return acc;
            }, []);
            if(result_array){
              return res.status(200).json({result: 'success', result_array: result_array});
            } else {
              return res.status(200).json({result: 'fail'});
            }
        } else {
            return res.status(403).json({error: 'no result'});
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function verifySubwayDetailThema (req, res) {
    const subway = req.body.subway;
    console.log("verifySubwayDetailThema called");
    const category_list = req.body.category_list;
    const condition = [];
    const leng = category_list.split(',').length;
    for (var i = 0; i < leng; i++) {
      condition.push(`${category_list.split(',')[i]}`);
    }
    console.log(condition);
    models.Cafe.findAll({
        where: {
            subway: subway,
            mainmenu_type: {
              [Op.or]: condition
            }
        }})
        .then(result => {
        if(result !== null) {
            res.status(200).json({result: 'success'})
        } else {
            res.status(200).json({result: 'no subway'})
        }
    }).catch(err => {
        return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    });
}

function crawlImage (req, res) {
  const res1 = req.body.res1;

  let url = 'https://search.naver.com/search.naver?where=image&sm=tab_jum&query='+encodeURIComponent(res1);

  client.fetch(url, param, function(err, $, resp){
      if(err){
          console.log(err);
          return;
      }
      let img_array = [];

      $('._img').each(function (idx) {
        img_array.push($(this).attr('data-source'));
      });
      return res.status(200).json({success: true, res1: img_array})

  });
}

function crawlTwoImage (req, res) {
  const content1 = req.body.content1;
  const content2 = req.body.content2;

  let url = 'https://search.naver.com/search.naver?where=image&sm=tab_jum&query='+encodeURIComponent(content1);
  let url2 = 'https://search.naver.com/search.naver?where=image&sm=tab_jum&query='+encodeURIComponent(content2);
  client.fetch(url, param, function(err, $, resp){
      if(err){
          console.log(err);
          return;
      }
      let img_array = [];
      let img_array2 = [];

      $('._img').each(function (idx) {
        img_array.push($(this).attr('data-source'));
      });
      client.fetch(url2, param, function(err, $, resp2){
          if(err){
              console.log(err);
              return;
          }
          $('._img').each(function (idx2) {
            img_array2.push($(this).attr('data-source'));
          });
          if(img_array && img_array2){
            return res.status(200).json({success: true, res1: img_array, res2: img_array2})
          }else{
            return res.status(200).json({success: false, res1: 'no_image', res2: 'no image'})
          }
      });
  });
}

function previousRegisterUser (req, res) {
    //  let email_example = String(Math.floor(Math.random() * 100000) + 1);
     let kakao_id;
     if (req.body){
         kakao_id = req.body.kakao_id
     } else {
         return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id).'})
     }
     if (!kakao_id){
         return res.status(403).json({success: false, message: 'Kakao_id not given in Body. Check parameters.'})
     }
     models.User.findOne({
         where: {
             kakao_id: kakao_id
         }
     }).then(user => {
         if (user){
             models.User.update(
               {
                 scenario: '100',
                 state: 'init'
               },     // What to update
               {where: {
                       kakao_id: kakao_id}
               })  // Condition
               .then(result => {
                 return res.status(403).json({success: false, message: 'user with same kakao_id already exists'});
               })
         } else {
             models.User.create({
                 kakao_id: req.body.kakao_id,
                 email: req.body.email,
                 password: req.body.password,
                 //encrypted_kakao_id: encrypted_kakao_id,
                 scenario: '100',
                 state: 'init',
                 social: false,
                 registered: '-1',
             }).then(user => {
                 return res.status(200).json({success: true, message: 'user created.', user: user})
             }).catch(function (err){
               return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
             });
         }
     })
 }

 function registerOnetimeUser (req, res) {
     const email=req.body.email;
     const name=req.body.name;
     const pwd=req.body.password;

     models.User.create({
         email: email,
         password: pwd,
         name: name,
         //encrypted_kakao_id: encrypted_kakao_id,
         scenario: '100',
         state: 'init',
         social: false,
         registered: '-1',
     }).then(user => {
       if(user){
         return res.status(200).json({success: true, message: 'onetime user created.', user: user});
       } else{
         return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message});
       }
     }).catch(err => {
         return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
 }

 function getPartLog (req, res) {
     const email = req.body.email;
     const targetcol = req.body.col;
     const now_date = moment();

     models.User.findOne({
         attributes: [targetcol, 'updated_at'],
         where: {
             email: email
         }
     }).then(result => {
       if(result){
         const last_date = result.updated_at;
         const disconn_min = now_date.diff(last_date, 'minutes');

         if (disconn_min > 10) { // 마지막 접속으로 시나리오 진행으로부터 10분이 지나면 접속끊음으로 판단
           models.User.update(
             {
               scenario: '100',
               state: 'init'
             },     // What to update
             {where: {
                     email: email}
             })  // Condition
             .then(update_result => {
               return res.status(200).json({success: true, message: result[targetcol], disconn_type: 'permanent'});
             }).catch(err => {
                 return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
             });
         } else { // 마지막 접속으로부터 10분 이하 이내로 다시 접속 시, 일시적 접속 끊김으로 판단
           return res.status(200).json({success: true, message: result[targetcol], disconn_type: 'temporary'});
         }
       }else{
         return res.status(401).json({message: 'Cant find user email : ' + err.message})
       }
     }).catch(err => {
         return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
 }

 function getChatLog (req, res) {
     const email = req.body.email;
     const now_date = moment();

     models.User.findOne({
         attributes: ['chat_log', 'updated_at'],
         where: {
             email: email
         }
     }).then(result => {
       if(result){
         const last_date = result.updated_at;
         const disconn_min = now_date.diff(last_date, 'minutes');

         if (disconn_min > 10) { // 마지막 접속으로 시나리오 진행으로부터 10분이 지나면 접속끊음으로 판단
           models.User.update(
             {
               scenario: '100',
               state: 'init'
             },     // What to update
             {where: {
                     email: email}
             })  // Condition
             .then(update_result => {
               return res.status(200).json({success: true, message: result.chat_log, disconn_type: 'permanent'});
             }).catch(err => {
                 return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
             });
         } else { // 마지막 접속으로부터 10분 이하 이내로 다시 접속 시, 일시적 접속 끊김으로 판단
           return res.status(200).json({success: true, message: result.chat_log, disconn_type: 'temporary'});
         }
       }else{
         return res.status(401).json({message: 'Cant find user email : ' + err.message})
       }
     }).catch(err => {
         return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
 }

 function deleteChatLog (req, res) {
     const email = req.body.email;
     models.User.findOne({
         attributes: ['chat_log'],
         where: {
             email: email
         }
     }).then(user => {
        if(user){
          models.User.update(
            {
             chat_log: null,
             scenario: '100',
             state: 'init',
            },     // What to update
            {where: {
                   email: email}
            })  // Condition
            .then(result => {
             return res.status(200).json({success: true, message: result.chat_log});
            }).catch(err => {
               return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
            });
        } else{
           return res.status(401).json({message: 'Cant find user email : ' + err.message})
        }
     }).catch(err => {
         return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
 }

 function deletePartLog (req, res) {
     const email = req.body.email;
     const targetcol = req.body.col;
     models.User.findOne({
         attributes: [targetcol],
         where: {
             email: email
         }
     }).then(user => {
        if(user){
          models.User.update(
            {
             [targetcol]: null,
             scenario: '100',
             state: 'init',
            },     // What to update
            {where: {
                   email: email}
            })  // Condition
            .then(result => {
             return res.status(200).json({success: true, message: result[targetcol]});
            }).catch(err => {
               return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
            });
        } else{
           return res.status(401).json({message: 'Cant find user email : ' + err.message})
        }
     }).catch(err => {
         return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
 }

 function getSubwayListHistory (req, res) {
     const email = req.query.email;

     models.sequelize.query(`SELECT p.subway, p.date
FROM decide_histories AS p
WHERE date=(SELECT MAX(date) FROM decide_histories WHERE subway = p.subway AND email = '${email}') GROUP BY subway ORDER BY date LIMIT 5;`).then(result => {
       if (result) {
         let user_subway_array = result[0].reduce((acc,cur) => {
           let history_date = moment(cur.date).format('MM.DD');
           acc.push({
             'subway': cur.subway,
             'date': history_date
           });
           return acc;
         },[]);
         return res.status(200).json(user_subway_array);
       } else {
         return res.status(200).json([]);
       }
     }).catch(function (err){
       return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     })
 }

 function findSubwayDrinkType(req, res) {
   const subway = req.body.subway;
   const exit_quarter = req.body.exit_quarter;

   models.sequelize.query(`SELECT drink_type FROM restaurants WHERE
     subway = '${subway}' and exit_quarter IN (${exit_quarter}) GROUP BY drink_type;`).then(result => {
         if(result){
             let drink_type_array = result[0].reduce((acc,cur) => {
               if (String(cur.drink_type).includes(',')) {
                 cur = cur.drink_type.split(',');
                 cur.forEach(function(obj){
                   if (String(obj).includes('맥주')) {
                     acc.push('맥주');
                   } else if (String(obj).includes('양주')) {
                     acc.push('양주&칵테일');
                   } else {
                     acc.push(obj);
                   }
                 });
               } else {
                 if (String(cur.drink_type).includes('맥주')) {
                  acc.push('맥주');
                } else if (String(cur.drink_type).includes('양주')) {
                  acc.push('양주&칵테일');
                } else {
                  acc.push(cur.drink_type);
                }
               }
               return acc;
             },[]);
             let uniq_array = drink_type_array.reduce(function(a,b){
             	if ((a.indexOf(b) < 0) && b !== null ) a.push(b);
             	return a;
             },[]);

             return res.status(200).json(uniq_array);
         }else{
             return res.status(403).json({error: 'no result'});
         }
     }).catch(function (err){
       return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     })
 }

 function getDrinkRestaurant (req, res) {
   const kakao_id = req.body.kakao_id;
   let subway = req.body.subway;
   let exit_quarter = req.body.exit_quarter;
   let mood2 = req.body.mood2;
   let taste = req.body.taste;
   let drink_round = req.body.drink_round;
   let drink_type = req.body.drink_type;

   let subway_flag = '';
   let taste_flag = '';
   let drink_type_flag = '';
   let drink_round_flag = '';
   let mood2_flag = '';

   drink_type = drink_type.replace(/,/g,' ');
   drink_type = drink_type.replace('양주&칵테일','양주');
   if (drink_type === '상관없음') {
     drink_type = '맥주 양주 와인 사케 소주 전통주';
   }

   let drink_type_array = drink_type.split(' ');

   function shuffle(a) {
       for (let i = a.length - 1; i > 0; i--) {
           const j = Math.floor(Math.random() * (i + 1));
           [a[i], a[j]] = [a[j], a[i]];
       }
       return a;
   }


   if (subway === '서울 어디든 좋아' || subway === null){
     subway = 'x';
     subway_flag = 'NOT';
   }

   if (exit_quarter.includes('999')){
     exit_quarter = '1,2,3,4';
   }

   if (taste === null || taste === undefined) {
     taste = 'x';
     taste_flag = 'NOT';
   } else if (taste.includes('-')) {
     taste = taste.replace('-','');
     taste_flag = 'NOT';
   }

   if (mood2 === null || mood2 === undefined) {
     mood2_flag = 'NOT';
     mood2 = 'x';
   } else if (mood2.includes('-') || mood2 === 'all') {
     mood2_flag = 'NOT';
   }

   if (drink_round === null || drink_round === undefined) {
     drink_round = '2 3 4';
     // drink_round_flag = 'NOT';
   }
   // let drink_round_array=drink_round.replace(/-/g, '').split(' ');

   if (drink_type === '소주' || drink_type === '맥주' || drink_type === '소주 맥주' || drink_type === '맥주 소주') {
     drink_type = drink_type.replace('맥주','생맥주 병맥주 중식맥주');
     models.sequelize.query(`(SELECT * FROM restaurants WHERE
        ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
         (exit_quarter IN (${exit_quarter})) AND
          ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
           (match(taste) against('고기 해산물' in boolean mode)) AND
            ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
             ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
              (match(drink_type) against('${drink_type}' in boolean mode))
               ORDER BY RAND() LIMIT 1) UNION ALL (SELECT * FROM restaurants WHERE
                  ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
                   (exit_quarter IN (${exit_quarter})) AND
                    ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
                     ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
                      NOT (match(taste) against('고기 해산물' in boolean mode)) AND
                       ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
                        (match(drink_type) against('${drink_type}' in boolean mode)) ORDER BY RAND() LIMIT 1);`).then(result => {
         if (result[0].length === 2){
             console.log('result: ' + result.toString())
             return res.status(200).json({success: true, try: 1, message: result[0]})
         } else {
           models.sequelize.query(`(SELECT * FROM restaurants WHERE
            ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
             (exit_quarter IN (1,2,3,4)) AND
              ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
               (match(taste) against('고기 해산물' in boolean mode)) AND
                ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
                 ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
                  (match(drink_type) against('${drink_type}' in boolean mode))
                   ORDER BY RAND() LIMIT 1) UNION ALL (SELECT * FROM restaurants WHERE
                      ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
                       (exit_quarter IN (1,2,3,4)) AND
                        ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
                         ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
                          NOT (match(taste) against('고기 해산물' in boolean mode)) AND
                           ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
                            (match(drink_type) against('${drink_type}' in boolean mode)) ORDER BY RAND() LIMIT 1);`).then(second_result => {
           if (second_result[0].length === 2) {
             console.log('second result: ' + second_result.toString())
             return res.status(200).json({success: true, try: 2, message: second_result[0]})
           } else {
             return res.status(403).json({success: false, message: 'no result'})
           }
         }).catch( err => {
           return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
         });
       }
     }).catch( err => {
       return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
   } else if (drink_type_array.length >= 2) {
     shuffle(drink_type_array);
     drink_type_array = drink_type_array.reduce((acc,cur) => {
       if (cur === '맥주') {
         cur = '생맥주 중식맥주 병맥주';
       }
       acc.push(cur);
       return acc;
     },[]);
     models.sequelize.query(`(SELECT * FROM restaurants WHERE
        ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND (exit_quarter IN (${exit_quarter})) AND
         ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
          ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
           ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
            (match(drink_type) against('${drink_type_array[0]}' in boolean mode))
             ORDER BY RAND() LIMIT 1) UNION ALL (SELECT * FROM restaurants WHERE
                ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
                 (exit_quarter IN (${exit_quarter})) AND
                  ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
                   ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
                    ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
                     (match(drink_type) against('${drink_type_array[1]}' in boolean mode)) ORDER BY RAND() LIMIT 1);`).then(result => {
         if (result[0].length === 2){
             console.log('result: ' + result.toString())
             return res.status(200).json({success: true, try: 1, message: result[0]})
         } else {
           models.sequelize.query(`(SELECT * FROM restaurants WHERE
              ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND (exit_quarter IN (1,2,3,4)) AND
               ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
                ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
                 ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
                  (match(drink_type) against('${drink_type_array[0]}' in boolean mode))
                   ORDER BY RAND() LIMIT 1) UNION ALL (SELECT * FROM restaurants WHERE
                      ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND
                       (exit_quarter IN (1,2,3,4)) AND
                        ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
                         ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
                          ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
                           (match(drink_type) against('${drink_type_array[1]}' in boolean mode)) ORDER BY RAND() LIMIT 1);`).then(second_result => {
           if (second_result[0].length === 2) {
             console.log('second result: ' + second_result.toString())
             return res.status(200).json({success: true, try: 2, message: second_result[0]})
           } else {
             return res.status(403).json({success: false, message: 'no result'})
           }
         }).catch( err => {
           return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
         });
       }
     }).catch( err => {
       return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
   } else if (drink_type_array.length === 1) {
     models.sequelize.query(`SELECT * FROM restaurants WHERE
        ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND (exit_quarter IN (${exit_quarter})) AND
         ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
          ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
           ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
            (match(drink_type) against('${drink_type}' in boolean mode)) ORDER BY RAND() LIMIT 2;`).then(result => {
         if (result[0].length === 2){
             console.log('result: ' + result.toString())
             return res.status(200).json({success: true, try: 1, message: result[0]})
         } else {
           models.sequelize.query(`SELECT * FROM restaurants WHERE
              ${subway_flag} (match(subway) against('${subway}' in boolean mode)) AND (exit_quarter IN (1,2,3,4)) AND
               ${mood2_flag} (match(mood2) against('${mood2}' in boolean mode)) AND
                ${taste_flag} (match(taste) against('${taste}' in boolean mode)) AND
                 ${drink_round_flag} (match(drink_round) against('${drink_round}' in boolean mode)) AND
                  (match(drink_type) against('${drink_type}' in boolean mode)) ORDER BY RAND() LIMIT 2;`).then(second_result => {
           if (second_result[0].length === 2) {
             console.log('second result: ' + second_result.toString())
             return res.status(200).json({success: true, try: 2, message: second_result[0]})
           } else {
             return res.status(403).json({success: false, message: 'no result'})
           }
         }).catch( err => {
           return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
         });
       }
     }).catch( err => {
       return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
     });
   }
 }

 // function getCafe(req, res) {
//   let subway = req.body.subway_cafe;
//   let exit_quarter = req.body.exit_quarter;
//   let mainmenu_type = req.body.mainmenu_type;
//   console.log(`getCafe함수에서 subway : ${subway}, exit_quarter : ${exit_quarter}, mainmenu_type : ${mainmenu_type}`);
//
//   const condition = [];
//   const cLeng = mainmenu_type.split(',').length;
//   if(mainmenu_type.includes('!')) {
//     for (var i = 0; i < cLeng; i++) {
//       condition.push(`${mainmenu_type.split(',')[i].split('!')[1]}`);
//     }
//   } else {
//     for (var i = 0; i < cLeng; i++) {
//       condition.push(`${mainmenu_type.split(',')[i]}`);
//     }
//   }
//   console.log(condition);
//
//   const condition2 = [];
//   const cLeng2 = exit_quarter.split(',').length;
//   for(var j = 0; j < cLeng2; j++) {
//     condition2.push(`${exit_quarter.split(',')[j]}`);
//   }
//
//   models.Cafe.findAll({
//       where: {
//           subway: subway,
//           exit_quarter: {
//             [Op.or]: condition2
//           },
//           mainmenu_type: {
//             [Op.or]: condition
//           }
//       }})
//       .then(result => {
//         // console.log(result);
//       if(result.length !== 0) {
//         console.log("if");
//         const leng = result.length;
//         const rand = Math.floor(Math.random() * leng);
//         models.Sequelize.query
//
//         res.status(200).json({success: true, message: result[rand], exit_quarter: true})
//       } else {
//         models.Cafe.findAll({
//           where: {
//               subway: subway,
//               mainmenu_type: {
//                 [Op.or]: condition
//               }
//             }
//         }).then(result => {
//           console.log("else");
//           console.log(result);
//           const leng = result.length;
//           const rand = Math.floor(Math.random() * leng);
//           res.status(200).json({success: true, message: result[rand], exit_quarter: false})
//         }).catch(err => {
//           return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
//         });
//       }
//   }).catch(err => {
//     return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
//   });
// }

function getCafe(req, res) {
  let subway = req.body.subway_cafe;
  let exit_quarter = req.body.exit_quarter;
  let mainmenu_type = req.body.mainmenu_type;
  console.log(`getCafe함수에서 subway : ${subway}, exit_quarter : ${exit_quarter}, mainmenu_type : ${mainmenu_type}`);

  var condition;
  const cLeng = mainmenu_type.split(',').length;
  if(mainmenu_type.includes('!')) {
    condition = `(mainmenu_type LIKE ("%테마%") and mainmenu_type not LIKE ("%${mainmenu_type.split(',')[0].split('!')[1]}%")`;
    for (var i = 1; i < cLeng; i++) {
      condition += ` and mainmenu_type not LIKE ("%${mainmenu_type.split(',')[i].split('!')[1]}%")`;
    }
    condition += ')';
  } else {
    condition = `(mainmenu_type LIKE ("%${mainmenu_type.split(',')[0]}%")`;
    for (var i = 1; i < cLeng; i++) {
      condition += ` or mainmenu_type LIKE ("%${mainmenu_type.split(',')[i]}%")`;
    }
    condition += ')';
  }
  console.log(condition);
  models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and ` + condition + ` order by RAND() LIMIT 1;`).then(result => {
      if (result[0].length !== 0){
        models.sequelize.query(`SELECT * from cafes where id != '${result[0].id}' and subway = '${subway}' and exit_quarter in (${exit_quarter}) and mainmenu_type LIKE ("%테마%") order by RAND() LIMIT 1;`).then(result2 => {
            if (result2[0].length !== 0){
              return res.status(200).json({success: true, message: '2', result: [result[0], result2[0]]})
            } else {
              models.sequelize.query(`SELECT * from cafes where id != '${result[0].id}' and subway = '${subway}' and mainmenu_type LIKE ("%테마%") order by RAND() LIMIT 1;`).then(result3 => {
                  if (result3[0].length !== 0){
                    return res.status(200).json({success: true, message: '1', result: [result[0], result3[0]]})
                  } else {
                    return res.status(500).json({success: false})
                  }
             }).catch(function (err){
                return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
              })
            }
       }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
      } else {
        models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and ` + condition + ` order by RAND() LIMIT 1;`).then(result => {
            if (result[0].length !== 0){
              models.sequelize.query(`SELECT * from cafes where id != '${result[0].id}' and subway = '${subway}' and mainmenu_type LIKE ("%테마%") order by RAND() LIMIT 1;`).then(result2 => {
                  if (result2[0].length !== 0){
                    return res.status(200).json({success: true, message: '1', result: [result[0], result2[0]]})
                  } else {
                    return res.status(500).json({success: false})
                  }
             }).catch(function (err){
                return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
              })
            } else {
              return res.status(500).json({success: false})
            }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
      }
  }).catch(function (err){
    return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  })
}

function getCafe2(req, res) {
  let subway = req.body.subway_cafe;
  let exit_quarter = req.body.exit_quarter;
  let mainmenu_type = req.body.mainmenu_type;
  let mood1 = req.body.mood1;
  let query1, query2, query3;
  if (mood1 === null || mood1 === '전체포함') {
    mood1 = '';
    query1 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and not match(mood2) against('큰프') and match(mainmenu_type) against ('${mainmenu_type}') order by RAND() LIMIT 2;`;
    query2 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and match(mainmenu_type) against ('${mainmenu_type}') order by RAND() LIMIT 2;`;
    query3 = `SELECT * from cafes where subway = '${subway}' and match(mainmenu_type) against ('${mainmenu_type}') order by RAND() LIMIT 2;`;
  } else {
    query1 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and not match(mood2) against('큰프') and match(mainmenu_type) against ('${mainmenu_type}') and mood1 not LIKE ('%포장만%') order by RAND() LIMIT 2;`;
    query2 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and match(mainmenu_type) against ('${mainmenu_type}') and mood1 not LIKE ('%포장만%') order by RAND() LIMIT 2;`;
    query3 = `SELECT * from cafes where subway = '${subway}' and match(mainmenu_type) against ('${mainmenu_type}') and mood1 not LIKE ('%포장만%') order by RAND() LIMIT 2;`;
  }
  console.log(`getCafe2함수에서 subway : ${subway}, exit_quarter : ${exit_quarter}, mainmenu_type : ${mainmenu_type}, mood1 : ${mood1}`);
  models.sequelize.query(query1).then(result => {
      if (result[0].length !== 0){
        // 2개 발견
        if (result[0].length >= 2) {
          return res.status(200).json({success: true, message: '2', result: result[0]})
        }
        // 1개만 발견
        else {
          models.sequelize.query(query2).then(result => {
            if (result[0].length >= 2) {
              return res.status(200).json({success: true, message: '1', result: result[0]})
            } else {
              models.sequelize.query(query3).then(result => {
                if (result[0].length >= 2) {
                  return res.status(200).json({success: true, message: '0', result: result[0]})
                } else {
                  return res.status(500).json({success: false})
                }
              }).catch(function (err){
                return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
              })
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
          })
        }

      }
      else {
        models.sequelize.query(query3).then(result => {
          if (result[0].length >= 2) {
            return res.status(200).json({success: true, message: '0', result: result[0]})
          } else {
            return res.status(500).json({success: false})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
      }
  }).catch(function (err){
    return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  })
}

function getCafeTest(req, res) {
  console.log("getCafeTest arrived.");
  let subway = req.body.subway_cafe;
  let mainmenu_type = req.body.mainmenu_type;
  let query1, query2, query3;

  query1 = `SELECT * from cafes where subway = '${subway}' and not match(mainmenu_type) against ('${mainmenu_type}') order by RAND() LIMIT 2;`;
  query2 = `SELECT * from cafes where subway = '${subway}' and not match(mainmenu_type) against ('${mainmenu_type}') order by RAND() LIMIT 2;`;
  query3 = `SELECT * from cafes where subway = '${subway}' and not match(mainmenu_type) against ('${mainmenu_type}') order by RAND() LIMIT 2;`;

  models.sequelize.query(query1).then(result => {
      if (result[0].length !== 0){
        // 2개 발견
        if (result[0].length >= 2) {
          return res.status(200).json({success: true, message: '2', result: result[0]})
        }
        // 1개만 발견
        else {
          models.sequelize.query(query2).then(result => {
            if (result[0].length >= 2) {
              return res.status(200).json({success: true, message: '1', result: result[0]})
            } else {
              models.sequelize.query(query3).then(result => {
                if (result[0].length >= 2) {
                  return res.status(200).json({success: true, message: '0', result: result[0]})
                } else {
                  return res.status(500).json({success: false})
                }
              }).catch(function (err){
                return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
              })
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
          })
        }
      }
      else {
        models.sequelize.query(query3).then(result => {
          if (result[0].length >= 2) {
            return res.status(200).json({success: true, message: '0', result: result[0]})
          } else {
            return res.status(500).json({success: false})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
      }
  }).catch(function (err){
    return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  })
}

function getCafe3(req, res) {
  const kakao_id = req.body.kakao_id;
  let subway = req.body.subway_cafe;
  let exit_quarter = req.body.exit_quarter;
  let mood1 = req.body.mood1;
  console.log(`getCafe3함수에서 subway : ${subway}, exit_quarter : ${exit_quarter}, mood1 : ${mood1}`);
  let query;
  if (mood1.includes('&&')) {
    console.log("&& included");
    models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and not match(mood2) against('큰프') and mood1 in ('수다,노트북') order by RAND() LIMIT 2;`).then(result => {
        if (result[0].length !== 0){
          // 2개 발견
          if (result[0].length >= 2) {
            return res.status(200).json({success: true, message: '2', result: result[0]})
          }
          // 1개만 발견
          else {
            models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and mood1 in ('수다,노트북') order by RAND() LIMIT 2;`).then(result => {
              if (result[0].length >= 2) {
                return res.status(200).json({success: true, message: '1', result: result[0]})
              } else {
                models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and mood1 in ('수다,노트북') order by RAND() LIMIT 2;`).then(result => {
                  if (result[0].length >= 2) {
                    return res.status(200).json({success: true, message: '0', result: result[0]})
                  } else {
                    return res.status(500).json({success: false})
                  }
                }).catch(function (err){
                  return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
                })
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
            })
         }
        }
        else {
          models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and mood1 in ('수다,노트북') order by RAND() LIMIT 2;`).then(result => {
            if (result[0].length >= 2) {
              return res.status(200).json({success: true, message: '0', result: result[0]})
            } else {
              return res.status(500).json({success: false})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
          })
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
  } else {
    console.log("&& not included");
    models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and not match(mood2) against('큰프') and match(mood1) against ('${mood1}') order by RAND() LIMIT 2;`).then(result => {
        if (result[0].length !== 0){
          // 2개 발견
          if (result[0].length >= 2) {
            return res.status(200).json({success: true, message: '2', result: result[0]})
          }
          // 1개만 발견
          else {
            models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and match(mood1) against ('${mood1}') order by RAND() LIMIT 2;`).then(result => {
              if (result[0].length >= 2) {
                return res.status(200).json({success: true, message: '1', result: result[0]})
              } else {
                models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and match(mood1) against ('${mood1}') order by RAND() LIMIT 2;`).then(result => {
                  if (result[0].length >= 2) {
                    return res.status(200).json({success: true, message: '0', result: result[0]})
                  } else {
                    return res.status(500).json({success: false})
                  }
                }).catch(function (err){
                  return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
                })
              }
            }).catch(function (err){
              return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
            })
         }
        }
        else {
          models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and match(mood1) against ('${mood1}') order by RAND() LIMIT 2;`).then(result => {
            if (result[0].length >= 2) {
              return res.status(200).json({success: true, message: '0', result: result[0]})
            } else {
              return res.status(500).json({success: false})
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
          })
        }
    }).catch(function (err){
      return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
    })
  }
}

function getCafe4(req, res) {
  let subway = req.body.subway_cafe;
  let exit_quarter = req.body.exit_quarter;
  let mainmenu_type = req.body.mainmenu_type;
  let food_name = req.body.food_name;
  let mood2 = req.body.mood2;
  if(food_name === null || food_name === 'null') {
    food_name = '';
  }
  if(mood2 === null || mood2 === 'null') {
    mood2 = '';
  }
  console.log(`getCafe4함수에서 subway : ${subway}, exit_quarter : ${exit_quarter}, mainmenu_type : ${mainmenu_type}, food_name : ${food_name}, mood2 : ${mood2}`);

  models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and not match(mood2) against('큰프') and mood2 LIKE '%${mood2}%' and match(mainmenu_type) against ('${mainmenu_type}') and food_name LIKE '%${food_name}%' order by RAND() LIMIT 2;`).then(result => {
      if (result[0].length !== 0){
        // 2개 발견
        if (result[0].length >= 2) {
          return res.status(200).json({success: true, message: '2', result: result[0]})
        }
        // 1개만 발견
        else {
          models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and mood2 LIKE '%${mood2}%' and match(mainmenu_type) against ('${mainmenu_type}') and food_name LIKE '%${food_name}%' order by RAND() LIMIT 2;`).then(result => {
            if (result[0].length >= 2) {
              return res.status(200).json({success: true, message: '1', result: result[0]})
            } else {
              models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and mood2 LIKE '%${mood2}%' and match(mainmenu_type) against ('${mainmenu_type}') and food_name LIKE '%${food_name}%' order by RAND() LIMIT 2;`).then(result => {
                if (result[0].length >= 2) {
                  return res.status(200).json({success: true, message: '0', result: result[0]})
                } else {
                  return res.status(500).json({success: false})
                }
              }).catch(function (err){
                return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
              })
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
          })
        }
      }
      else {
        models.sequelize.query(`SELECT * from cafes where subway = '${subway}' and mood2 LIKE '%${mood2}%' and match(mainmenu_type) against ('${mainmenu_type}') and food_name LIKE '%${food_name}%' order by RAND() LIMIT 2;`).then(result => {
          if (result[0].length >= 2) {
            return res.status(200).json({success: true, message: '0', result: result[0]})
          } else {
            return res.status(500).json({success: false})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
      }
  }).catch(function (err){
    return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  })
}

function getCafe5(req, res) {
  console.log(req.body);
  let subway = req.body.subway_cafe;
  let exit_quarter = req.body.exit_quarter;
  let mainmenu_type = req.body.mainmenu_type;
  let food_name = req.body.food_name;
  let query1, query2, query3;
  if (mainmenu_type === null) {
    mainmenu_type = '';
  } else {
    mainmenu_type = req.body.mainmenu_type;
  }
  if (food_name === null) {
    food_name = '';
    query1 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and not match(mood2) against('큰프') and mainmenu_type LIKE ('%${mainmenu_type}%') order by RAND() LIMIT 2;`;
    query2 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and mainmenu_type LIKE ('%${mainmenu_type}%') order by RAND() LIMIT 2;`;
    query3 = `SELECT * from cafes where subway = '${subway}' and mainmenu_type LIKE ('%${mainmenu_type}%') order by RAND() LIMIT 2;`;
  } else {
    query1 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and not match(mood2) against('큰프') and mainmenu_type LIKE ('%${mainmenu_type}%') and match(food_name) against('${food_name}') order by RAND() LIMIT 2;`;
    query2 = `SELECT * from cafes where subway = '${subway}' and exit_quarter in (${exit_quarter}) and mainmenu_type LIKE ('%${mainmenu_type}%') and match(food_name) against('${food_name}') order by RAND() LIMIT 2;`;
    query3 = `SELECT * from cafes where subway = '${subway}' and mainmenu_type LIKE ('%${mainmenu_type}%') and match(food_name) against('${food_name}') order by RAND() LIMIT 2;`;
  }
  console.log(`getCafe5함수에서 subway : ${subway}, exit_quarter : ${exit_quarter}, mainmenu_type : ${mainmenu_type}, food_name : ${food_name}`);

  models.sequelize.query(query1).then(result => {
      if (result[0].length !== 0){
        // 2개 발견
        if (result[0].length >= 2) {
          return res.status(200).json({success: true, message: '2', result: result[0]})
        }
        // 1개만 발견
        else {
          models.sequelize.query(query2).then(result => {
            if (result[0].length >= 2) {
              return res.status(200).json({success: true, message: '1', result: result[0]})
            } else {
              models.sequelize.query(query3).then(result => {
                if (result[0].length >= 2) {
                  return res.status(200).json({success: true, message: '0', result: result[0]})
                } else {
                  return res.status(500).json({success: false})
                }
              }).catch(function (err){
                return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
              })
            }
          }).catch(function (err){
            return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
          })
        }
      }
      else {
        models.sequelize.query(query3).then(result => {
          if (result[0].length >= 2) {
            return res.status(200).json({success: true, message: '0', result: result[0]})
          } else {
            return res.status(500).json({success: false})
          }
        }).catch(function (err){
          return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
        })
      }
  }).catch(function (err){
    return res.status(500).json({success: false, message: 'Internal Server or Database Error. err: ' + err.message})
  })
}

module.exports = {
    crawlTwoImage: crawlTwoImage,
    crawlImage: crawlImage,

    verifyToken: verifyToken,
    checkTokenVerified: checkTokenVerified,
    registerUser: registerUser,
    login: login,
    socialLogin: socialLogin,
    logout: logout,
    sendNewPassword: sendNewPassword,
    sendInquiry: sendInquiry,
    memberWithdraw: memberWithdraw,
    updatePassword: updatePassword,
    updateSocket: updateSocket,
    getChatLog: getChatLog,
    deleteChatLog: deleteChatLog,

    previousRegisterUser: previousRegisterUser,
    updateUser: updateUser,
    updateLimitCnt: updateLimitCnt,
    updateState: updateState,
    updateChatLog: updateChatLog,

    updateStateEmail: updateStateEmail,
    updatePartLog: updatePartLog,
    deletePartLog: deletePartLog,
    getPartLog: getPartLog,
    registerOnetimeUser: registerOnetimeUser,
    loginOnetime: loginOnetime,

    getUserInfo: getUserInfo,
    getRestaurant: getRestaurant,
    getTwoRestaurant: getTwoRestaurant,
    getRestaurantInfo: getRestaurantInfo,
    updateUserStart: updateUserStart,
    updatePlaceStart: updatePlaceStart,
    updatePlaceInfo: updatePlaceInfo,
    updateMidInfo: updateMidInfo,
    updateRest2: updateRest2,
    getSubwayHistory: getSubwayHistory,
    verifyLimit: verifyLimit,
    createUserLog: createUserLog,
    createUserFeedback: createUserFeedback,
    getCountHistory: getCountHistory,
    getAllHistory: getAllHistory,
    getFeedbackInfo: getFeedbackInfo,
    getAllSubway: getAllSubway,
    getAllRestsaurant: getAllRestsaurant,
    getSimilarRestaurant: getSimilarRestaurant,
    verifySearchFood: verifySearchFood,
    verifySubway: verifySubway,
    verifySubwayDrinktype: verifySubwayDrinktype,
    verifySubwayThema: verifySubwayThema,
    verifySubwayDetailThema: verifySubwayDetailThema,
    getSubwayListHistory: getSubwayListHistory,
    getUserInfoByEmail: getUserInfoByEmail,
    findSubwayDrinkType: findSubwayDrinkType,
    getDrinkRestaurant: getDrinkRestaurant,
    updateDrinkStart: updateDrinkStart,
    updateLimitCntDrink: updateLimitCntDrink,
    verifyLimitDrink: verifyLimitDrink,
    updateLimitCntCafe: updateLimitCntCafe,
    verifyLimitCafe: verifyLimitCafe,
    updateCafeStart: updateCafeStart,
    updateCafe2: updateCafe2,
    getCafe: getCafe,
    getCafe2: getCafe2,
    getCafe3: getCafe3,
    getCafe4: getCafe4,
    getCafe5: getCafe5,
    getCafeInfo: getCafeInfo,
    createDecideHistory: createDecideHistory,
    getCafeTest: getCafeTest,
}
