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
var async = require('async');

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
    const cookie = req.cookies || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;
    const secret = config.jwt_secret;

    console.log(`cookie: ${cookie}`);
    console.log(`token: ${token}`);

    if (token) {
        console.log('token given');

        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                res.clearCookie('token');
                return res.status(403).json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
            } else {
                models.User.findOne({
                    where: {
                        email: decoded.email
                    }
                }).then(doctor => {

                    return res.status(200).json({success: true, message: 'Token verified.', email: doctor.email,
                        doctor_code: doctor.doctor_code, hospital: doctor.hospital, doctor_name: doctor.name, redirect: '/dashboard'})
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
    const nickname = req.body.nickname;
    const gender = req.body.gender;
    const ageGroup = req.body.ageGroup;

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
            nickname: nickname,
            gender: gender,
            ageGroup: parseInt(ageGroup)
        }).then(user => {
            res.status(201).json({success: true, meesage: 'Ok'});
        }).catch(err => {
            if(err) res.status(500).json({
                success: false,
                message: err.message,
                log: 'Error while creating user row in db. check uniqueness of parameters'
            });
        });
    });
}
// 수정 필요.
function login (req, res) {
    console.log(req.body);
    const email = req.body.email;
    const password = req.body.password;
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
        console.log(user);
        bcrypt.compare(password, user.password, (err, isMatch) => {
            console.log(err);
            console.log(isMatch);
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
                            nickname: user.nickname
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
                            return res.status(200).json({success: true, message: 'Ok', token: token, redirect: '/chat'});
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

function logout (req, res) {
    const cookie = req.cookie || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;
    const secret = config.jwt_secret;

    if (token) {
        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
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

function updateUser (req, res) {
    console.log('updateUser called.');
    let kakao_id;

    if (req.body){
        kakao_id = req.body.kakao_id;
        if (!kakao_id){
            return res.status(403).json({success: false, message: 'kakao_id not provided.'})
        }
    } else {
        return res.status(403).json({success: false, message: 'No input parameters received in body.'})
    }

    const nickname = req.body.nickname;
    const birthday = req.body.birthday;
    const sex = req.body.sex;
    const allergy = req.body.allergy;
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
    const with_mood = req.body.with_mood;
    const price = req.body.price;
    const rest5 = req.body.rest5;
    const rest6 = req.body.rest6;
    const rest_final = req.body.rest_final;
    const lat = req.body.lat;
    const lng = req.body.lng;
    const mid_lat = req.body.mid_lat;
    const mid_lng = req.body.mid_lng;
    const cnt = req.body.cnt;
    const limit_cnt = req.body.limit_cnt;



    if(nickname){
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
            daily_scenario: 0,
            stamp: 0,
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
                return res.status(200).json({success: true, message: 'No user found to update or User does not exist with given kakao_id. ' +
                    + result.toString()})
            }
        }).catch(function (err){
            return res.status(500).json({success: false, message: 'Updated failed. Error: ' + err.message})
        })

    }

    let param_name;
    let param_value;
    if (nickname){
        param_name = 'nickname';
        param_value = nickname;
    } else if (birthday) {
        param_name = 'birthday';
        param_value = birthday;
    } else if (sex) {
        param_name = 'sex';
        param_value = sex;
    } else if (allergy){
        param_name = 'allergy';
        param_value = allergy;
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
    } else if (with_mood){
        param_name = 'with_mood';
        param_value = with_mood;
    } else if (price){
        param_name = 'price';
        param_value = price;
    } else if (rest5){
        param_name = 'rest5';
        param_value = rest5;
    } else if (rest6){
        param_name = 'rest6';
        param_value = rest6;
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
    }

    if (param_value){
        models.sequelize.query('UPDATE users SET ' + param_name + " = '" + param_value + "' WHERE kakao_id = '" + kakao_id + "';").then(result => {
            if (result){
                console.log('result: ' + result.toString())
                return res.status(200).json({success: true, message: 'user data updated. Result info: ' + result[0].info})
            } else {
                return res.status(403).json({success: false, message: 'user update query failed.'})
            }
        }).catch(function (err){
            return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
        })
    } else {
        return res.status(403).json({success: false, message: 'No parameter given. Please check again. Required: kakao_id. ' +
            'And one more parameter is required among name, initials, user_code, email, phone, sex, birthday'})
    }
}

function getRestaurant (req, res) {
    const kakao_id = req.body.kakao_id;
    let subway = req.body.subway;
    let exit_quarter = req.body.exit_quarter;
    const mood = req.body.mood;
    let food_ingre = req.body.food_ingre;

    if(food_ingre === null){
      food_ingre = 'x';
    }
    if(subway === '서울 어디든 좋아' || subway === null){
      subway = '[가-힇]';
      exit_quarter = '[0-9]';
    }
    if(exit_quarter === 999){
      exit_quarter = '[0-9]';
    }

    let type_array = arrayShuffle(['한식','양식','일식']);

models.sequelize.query('(SELECT * FROM restaurants WHERE (subway regexp '+"'"+subway+"'"+') AND (exit_quarter regexp '+"'"+exit_quarter+"'"+') AND (mood regexp '+"'"+mood+"'"+') AND (food_type regexp '+"'"+type_array[0]+"'"+') AND (food_ingre NOT regexp '+"'"+food_ingre+"'"+') AND (closedown = 0) ORDER BY RAND() LIMIT 1) '+
  'UNION ALL (SELECT * FROM restaurants WHERE (subway regexp '+"'"+subway+"'"+') AND (exit_quarter regexp '+"'"+exit_quarter+"'"+') AND (mood regexp '+"'"+mood+"'"+') AND (food_type regexp '+"'"+type_array[1]+"'"+') AND (food_ingre NOT regexp '+"'"+food_ingre+"'"+') AND (closedown = 0) ORDER BY RAND() LIMIT 1) '+
'UNION ALL (SELECT * FROM restaurants WHERE (subway regexp '+"'"+subway+"'"+') AND (exit_quarter regexp '+"'"+exit_quarter+"'"+') AND (mood regexp '+"'"+mood+"'"+') AND (food_type regexp '+"'"+type_array[2]+"'"+') AND (food_ingre NOT regexp '+"'"+food_ingre+"'"+') AND (closedown = 0) ORDER BY RAND() LIMIT 1) '+
'UNION ALL (SELECT * FROM restaurants WHERE (subway regexp '+"'"+subway+"'"+') AND (exit_quarter regexp '+"'"+exit_quarter+"'"+') AND (mood regexp '+"'"+mood+"'"+') AND (food_type NOT regexp '+"'"+'한식'+"'"+') AND (food_type NOT regexp '+"'"+'일식'+"'"+') AND (food_type NOT regexp '+"'"+'양식'+"'"+') AND (food_ingre NOT regexp '+"'"+food_ingre+"'"+') AND (closedown = 0) ORDER BY RAND() LIMIT 1);').then(result => {
        if (result){
            console.log('result: ' + result.toString());
            console.log('길이 : '+result[0].length);
            if(result[0].length === 4){
              return res.status(200).json({success: true, comment: '좋아! 4곳을 골라줄테니까 한 번 골라봐!', message: result[0]})
            }else{
              models.sequelize.query('(SELECT * FROM restaurants WHERE (subway regexp '+"'"+subway+"'"+') AND (exit_quarter regexp '+"'"+exit_quarter+"'"+') AND (mood regexp '+"'"+mood+"'"+') AND (food_type regexp '+"'"+'[가-힇]'+"'"+') AND (food_ingre NOT regexp '+"'"+food_ingre+"'"+') AND (closedown = 0) ORDER BY RAND() LIMIT 4);').then(result2 => {
                if (result2){
                  if((result2[0].length != 4) && (mood === '초저렴')){
                    console.log('초저렴이 4개가 안되서 캐주얼에서 나머지 가져옴');

                    let result_nums = [];
                    if(result2[0].length === 0){
                      result_nums.push(0)
                    }else{
                      for(let i = 0; i < result2[0].length; i++){
                        result_nums.push(result2[0][i].id);
                      }
                    }
                    rest_count = 4 - result2[0].length
                    models.sequelize.query('(SELECT * FROM restaurants WHERE (subway regexp '+"'"+subway+"'"+') AND (exit_quarter regexp '+"'"+exit_quarter+"'"+') AND (mood regexp '+"'"+'캐주얼'+"'"+') AND (food_type regexp '+"'"+'[가-힇]'+"'"+') AND (food_ingre NOT regexp '+"'"+food_ingre+"'"+') AND (closedown = 0) AND id NOT IN ('+result_nums.toString()+') ORDER BY RAND() LIMIT '+rest_count+');').then(result3 => {
                      return res.status(200).json({success: true, comment: '여기는 초저렴 식당이 거의 없네... 그래도 최대한 적당한 가격선에서 골라줄게! 4곳을 골라줄테니까 한 번 골라봐!', message: result2[0].concat(result3[0])})
                    }).catch(function (err){
                        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
                    })
                  }else{
                    console.log("첫 결과가 4개가 안되서 두번째 검색(길이) : : "+result2[0].length);
                    return res.status(200).json({success: true, comment: '좋아! 4곳을 골라줄테니까 한 번 골라봐!', message: result2[0]})
                  }
                } else {
                    console.log('result없음');
                    return res.status(403).json({success: false, message: 'user update query failed.'})
                }
              }).catch(function (err){
                  return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
              })
           }
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    });
}

function getTwoRestaurant (req, res) {
    const kakao_id = req.body.kakao_id;
    const rest3 = req.body.rest3;
    const rest4 = req.body.rest4;

    models.sequelize.query('SELECT * FROM restaurants WHERE id= '+rest3+' UNION SELECT * FROM restaurants WHERE id= '+rest4+';').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    });
    //}
}

function getLastHistory (req, res) {
    const kakao_id = req.body.kakao_id;

    models.sequelize.query('SELECT * FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' ORDER BY id DESC LIMIT 1;').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    })
    //}
}

function getAllHistory (req, res) {
    const kakao_id = req.body.kakao_id;

    models.sequelize.query('SELECT * FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' ORDER BY id DESC;').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    })
    //}
}

function getTodayHistory (req, res) {
    const kakao_id = req.body.kakao_id;
    let nowDate = new Date();
    const date = moment().format('YYYYMMDD');


    models.sequelize.query('SELECT * FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' AND date = '+"'"+date+"'"+' ORDER BY id;').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    })
    //}
}

function getThreeHistory (req, res) {
    const kakao_id = req.body.kakao_id;
    let nowDate = new Date();
    const date = moment().format('YYYYMMDD');
    let yesterday = moment(date).subtract(1, 'd').format('YYYYMMDD');
    let twoDaysAgo = moment(date).subtract(2, 'd').format('YYYYMMDD');

    models.sequelize.query('SELECT * FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' AND date = '+"'"+date+"'"+' UNION '+'SELECT * FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' AND date = '+"'"+yesterday+"'"+
    ' UNION '+'SELECT * FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' AND date = '+"'"+twoDaysAgo+"'"+' ORDER BY id;').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    })
    //}
}

function getSubwayHistory (req, res) {
    const kakao_id = req.body.kakao_id;
    const subway = req.body.subway;

    models.sequelize.query('SELECT * FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' AND subway = '+"'"+subway+"'"+' ORDER BY id;').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    })
    //}
}

function getCountHistory (req, res) {
    const kakao_id = req.body.kakao_id;

    models.sequelize.query('SELECT *,count(*) as cnt FROM decide_histories WHERE kakao_id = '+"'"+kakao_id+"'"+' GROUP BY res_name ORDER BY cnt DESC;').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    })
    //}
}

function updateStamp (req, res) {
    const kakao_id = req.body.kakao_id
    const stamp = req.body.stamp

    //let nowDate = new Date();
    //nowDate.getTime();
    //const now = nowDate;

    //if ((scenario.indexOf("201") == 0) && (state == 'init')){
    models.User.update(
        {
            stamp: stamp
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
            return res.status(200).json({success: true, message: 'User Stamp Update complete.', stamp: stamp})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'User Stamp Update Update failed. Error: ' + err.message})
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
                return res.status(403).json({success: false, user_info: user, message: 'user info found. But error occured while retrieving logs.', error: err.message})
            })
        }).catch(function (err){
            return res.status(403).json({success: false, message: err.message})
        })
    } else {
        return res.status(403).json({success: false, message: 'kakao_id not given.'})
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
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
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
            exit_quarter: null,
            with_mood: null,
            price: null,
            rest1: null,
            rest2: null,
            rest3: null,
            rest4: null,
            rest5: null,
            rest6: null
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
            return res.status(200).json({success: true, message: 'UserStart Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'UserStart Update Update failed. Error: ' + err.message})
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
            return res.status(200).json({success: true, message: 'UserStart Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'UserStart Update Update failed. Error: ' + err.message})
    })
}


function updateRest4 (req, res) {
    console.log('updateRest4 called.')
    const kakao_id = req.body.kakao_id;
    const rest1 = req.body.rest1;
    const rest2 = req.body.rest2;
    const rest3 = req.body.rest3;
    const rest4 = req.body.rest4;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            rest1: rest1,
            rest2: rest2,
            rest3: rest3,
            rest4: rest4
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
            return res.status(200).json({success: true, message: 'UserRest4 Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'UserRest4 Update Update failed. Error: ' + err.message})
    })
}

function updateRestOnly2 (req, res) {
    console.log('updateRest4 called.')
    const kakao_id = req.body.kakao_id;
    const rest1 = req.body.rest1;
    const rest2 = req.body.rest2;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            rest4: rest1,
            rest6: rest2,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
            return res.status(200).json({success: true, message: 'UserRestOnly2 Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'UserRestOnly2 Update Update failed. Error: ' + err.message})
    })
}

function updateBeerOnly2 (req, res) {
    console.log('updateRest4 called.')
    const kakao_id = req.body.kakao_id;
    const rest1 = req.body.rest1;
    const rest2 = req.body.rest2;
    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            rest5: rest1,
            rest6: rest2,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
            return res.status(200).json({success: true, message: 'UserRestOnly2 Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'UserRestOnly2 Update Update failed. Error: ' + err.message})
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
            return res.status(200).json({success: true, message: 'updatePlaceInfo Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'updatePlaceInfo Update Update failed. Error: ' + err.message})
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
            return res.status(200).json({success: true, message: 'updatePlaceInfo Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'updatePlaceInfo Update Update failed. Error: ' + err.message})
    })
}

function createDecideHistory (req, res) {
    const kakao_id = req.body.kakao_id;
    const rest1 = req.body.rest1;
    const rest2 = req.body.rest2;
    const rest3 = req.body.rest3;
    const rest4 = req.body.rest4;
    const round1 = req.body.round1;
    const round2 = req.body.round2;
    const round3 = req.body.round3;
    const res_name = req.body.res_name;
    const subway = req.body.subway;
    // let nowDate = new Date();
    const date = moment().format('YYYYMMDD');


    models.Decide_history.create({
        kakao_id: kakao_id,
        rest1: rest1,
        rest2: rest2,
        rest3: rest3,
        rest4: rest4,
        round1: round1,
        round2: round2,
        round3: round3,
        res_name: res_name,
        subway: subway,
        date: date
    })
    .then(result => {
        return res.status(200).json({success: true, message: 'DecideHistory Update complete.'})
    }).catch(function (err){
    return res.status(403).json({success: false, message: 'DecideHistory Update Update failed. Error: ' + err.message})
    })
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
        return res.status(200).json({success: true, message: 'UserFeedback Create complete.'})
    }).catch(function (err){
    return res.status(403).json({success: false, message: 'UserFeedback Create failed. Error: ' + err.message})
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
            return res.status(403).json({success: false, message: 'user update query failed.'})
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
    const date = req.body.date
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
        models.User.update(
            {
                scenario: scenario,
                state: state,
                date: date,
                updated_at: date
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
                return res.status(200).json({success: true, message: 'User Log and User both Update complete.', updateResult: result, userLog: userLog})
            }).catch(function (err){
            return res.status(403).json({success: false, message: 'User Log updated. However User Update failed. Error: ' + err.message, userLog: userLog})
        })
        // return res.status(201).json({success: true, userLog})
    }).catch(function (err){
        return res.status(500).json({success: false, error: err.message})
    })
}

function updateLimitCnt (req, res) {
    console.log('updateMidInfo called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt = req.body.limit_cnt;
    const date = moment().format('MM/DD/H');

    // let nowDate = new Date();
    // nowDate.getTime();
    // const now = nowDate;

    models.User.update(
        {
            limit_cnt: limit_cnt,
            decide_updated_at: date,
        },     // What to update
        {where: {
                kakao_id: kakao_id}
        })  // Condition
        .then(result => {
            return res.status(200).json({success: true, message: 'updateLimitCnt Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'updateLimitCnt Update Update failed. Error: ' + err.message})
    })
}

function verifyLimit (req, res) { //끼니 당 3회 제한 판별 API함수
    console.log('verifyLimit called.')
    const kakao_id = req.body.kakao_id;
    const limit_cnt = req.body.limit_cnt; //현재 유저DB의 메뉴결정 횟수

    let decide_updated_at = req.body.decide_updated_at; //현재 유저의 마지막 메뉴결정 day/hour
    if(decide_updated_at === null){
      decide_updated_at = '99/99/99';
    }
    decide_updated_at = decide_updated_at.split('/');
    let now_time = moment().format('MM/DD/H'); //지금의 day/hour
    now_time = now_time.split('/');

    //hour에 따라, 0~9시,10~15시,16~24시를 기준으로 범위를 나눈다.
    function calTimeRange(value){
      if(value > 16){
        return 3;
      }else if(value > 10){
        return 2;
      }else{
        return 1;
      }
    }

    /*
    limit_cnt가 3일때,
     날짜가 같을 떄
      - 지금 시간의 범위와, 유저 시간의 범위가 같을 떄, 메뉴 고르기 제한
       - month가 다르면, 메뉴 고르기 가능
      - 지금 시간의 범위와, 유저 시간의 범위가 다를 떄, limit_cnt 0으로 초기화 시키고 메뉴 고르기 가능
     날짜가 다를 때
      - limit_cnt 0으로 초기화 시키고 메뉴 고르기 가능
    */
    if(limit_cnt === 3){
      if(decide_updated_at[1] === now_time[1]){
        if(calTimeRange(decide_updated_at[2]) === calTimeRange(now_time[2])){
          if(decide_updated_at[0] === now_time[0]){
            return res.status(200).json({result: 'failed'})
          }else{
            models.User.update(
                {
                    limit_cnt: 0,
                },     // What to update
                {where: {
                        kakao_id: kakao_id}
                })  // Condition
                .then(result => {
                  return res.status(200).json({result: 'success'})
                }).catch(function (err){
                return res.status(403).json({success: false, message: 'updateLimitCnt Update Update failed. Error: ' + err.message})
            })
          }
        }else{
          models.User.update(
              {
                  limit_cnt: 0,
              },     // What to update
              {where: {
                      kakao_id: kakao_id}
              })  // Condition
              .then(result => {
                return res.status(200).json({result: 'success'})
              }).catch(function (err){
              return res.status(403).json({success: false, message: 'updateLimitCnt Update Update failed. Error: ' + err.message})
          })
        }
      }else{
        models.User.update(
            {
                limit_cnt: 0,
            },     // What to update
            {where: {
                    kakao_id: kakao_id}
            })  // Condition
            .then(result => {
              return res.status(200).json({result: 'success'})
            }).catch(function (err){
            return res.status(403).json({success: false, message: 'updateLimitCnt Update Update failed. Error: ' + err.message})
        })
      }
    }else{ //limit_cnt가 3이 아닌경우 계속 진행 가능
      return res.status(200).json({result: 'success'})
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
            return res.status(200).json({success: true, message: 'User State Update complete.'})
        }).catch(function (err){
        return res.status(403).json({success: false, message: 'User State Update Update failed. Error: ' + err.message})
    })
    //}
}

function getRestInfo(req, res) {
    models.Restaurant.findOne({
        where: {
            id: req.params.id
        }
    }).then(result => {
        if(result){
            return res.status(200).json(result);
        }else{
            return res.status(404).json({error: 'no Restaurant column for '+id});
        }
    })
}

function getAllSubway(req, res) {
    models.Restaurant.findAll({
        attributes: ['subway'],
        group: 'subway'
    }).then(result => {
        let term = req.query.term;
        if(result){
            let resultArray = [];
            let findArray = [];
            for(let i=0;i<result.length;i++){
              resultArray.push(result[i].subway);
            }
            for(let i=0;i<resultArray.length;i++){
              let termLength = term.length;
              if(resultArray[i].substring(0,termLength).includes(term)){
                findArray.push(resultArray[i]);
              }
            }
            return res.status(200).json(findArray);
            // return '됨';
        }else{
            return res.status(404).json({error: 'no result'});
        }
    })
}

function getAllRestsaurant(req, res) {
    models.Restaurant.findAll({
        attributes: ['res_name','subway'],
        group: ['res_name', 'subway']
    }).then(result => {
        if(result){
            let resultArray = [];
            for(let i=0;i<result.length;i++){
              resultArray.push(result[i].subway + ' ' + result[i].res_name);
            }
            return res.status(200).json(resultArray);
            // return '됨';
        }else{
            return res.status(404).json({error: 'no result'});
        }
    })
}

function updateClosedown(req, res) {
  const res_name = req.body.res_name;
  const subway = req.body.subway;

  models.Restaurant.update(
      {
          closedown: 1
      },     // What to update
      {where: {
              res_name: res_name,
              subway: subway}
      })  // Condition
      .then(result => {
          return res.status(200).json({success: true, message: 'Closedown Update complete.'})
      }).catch(function (err){
      return res.status(403).json({success: false, message: 'Closedown Update failed. Error: ' + err.message})
  })
}

function verifySubway (req, res) {
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
        logger.error("DB Error in verifySubway :"+err.message);
        res.status(400).json({message: 'Failed. DB Error: ' + err.message})
    });
}

function getBeer (req, res) {
    const kakao_id = req.body.kakao_id;
    let flavor = parseInt(req.body.flavor);
    let soda = parseInt(req.body.soda);
    let alcohol = parseInt(req.body.alcohol);
    let place = parseInt(req.body.place);
    let alcohol_min = 0;
    let alcohol_max = 99;

    if(flavor === 4){
      flavor = '[0-9]';
    }
    if(soda === 3){
      soda = '[0-9]';
    }
    if(alcohol === 1){
      alcohol_min = 5.5;
    }else if(alcohol === 2){
      alcohol_max = 5.4;
    }

    if(place === 1){
      place = 'CU';
    }else if(place === 2){
      place = 'GS25';
    }else if(place === 3){
      place = '세븐일레븐';
    }else{
      place = '[a-z|가-힇]';
    }

models.sequelize.query('(SELECT * FROM beers WHERE (place regexp '+"'"+place+"'"+') AND (flavor regexp '+"'"+flavor+"'"+') AND (soda regexp '+"'"+soda+"'"+') AND (alcohol BETWEEN '+alcohol_min+' AND '+alcohol_max+') ORDER BY RAND() LIMIT 2);').then(result => {
        if (result){
            console.log('result: ' + result.toString());
            console.log('길이 : '+result[0].length);
            if(result[0].length === 2){
              return res.status(200).json({success: true, message: result[0]})
            }else{
              models.sequelize.query('(SELECT * FROM beers WHERE (place regexp '+"'"+place+"'"+') AND (flavor regexp '+"'"+flavor+"'"+') AND (soda regexp '+"'"+'[0-9]'+"'"+') AND (alcohol BETWEEN 0 AND 99) ORDER BY RAND() LIMIT 2);').then(result => {
                if (result){
                  console.log("첫 결과가 2개가 안되서 두번째 검색(길이) : : "+result[0].length);
                  return res.status(200).json({success: true, message: result[0]})
                } else {
                    console.log('result없음');
                    return res.status(403).json({success: false, message: 'user update query failed.'})
                }
              }).catch(function (err){
                  return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
              })
           }
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    });
}

function getTwoBeer (req, res) {
    const kakao_id = req.body.kakao_id;
    const rest3 = req.body.rest3;
    const rest4 = req.body.rest4;

    models.sequelize.query('SELECT * FROM beers WHERE id= '+rest3+' UNION SELECT * FROM beers WHERE id= '+rest4+';').then(result => {
        if (result){
            console.log('result: ' + result.toString())
            return res.status(200).json({success: true, message: result[0]})
        } else {
            console.log('result없음');
            return res.status(403).json({success: false, message: 'user update query failed.'})
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown error while querying users table for update from ChatBot server. err: ' + err.message})
    });
    //}
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
     let email_example = String(Math.floor(Math.random() * 100000) + 1);
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
                 kakao_id: kakao_id,
                 //encrypted_kakao_id: encrypted_kakao_id,
                 scenario: '100',
                 state: 'init',
                 registered: '0',
                 email: email_example
             }).then(user => {
                 return res.status(201).json({success: true, message: 'user created.', user: user})
             }).catch(function (err){
                 return res.status(500).json({success: false, message: 'Error while creating User in DB.', error: err.message, err: err})
             });
         }
     })
 }

module.exports = {
    crawlTwoImage: crawlTwoImage,
    crawlImage: crawlImage,

    verifyToken: verifyToken,
    checkTokenVerified: checkTokenVerified,
    registerUser: registerUser,
    login: login,
    logout: logout,

    previousRegisterUser: previousRegisterUser,
    updateUser: updateUser,
    updateLimitCnt: updateLimitCnt,
    updateStamp: updateStamp,
    updateState: updateState,
    getUserInfo: getUserInfo,
    getRestaurant: getRestaurant,
    getRestInfo: getRestInfo,
    getTwoRestaurant: getTwoRestaurant,
    getRestaurantInfo: getRestaurantInfo,
    updateUserStart: updateUserStart,
    updatePlaceStart: updatePlaceStart,
    updatePlaceInfo: updatePlaceInfo,
    updateMidInfo: updateMidInfo,
    updateRest4: updateRest4,
    updateRestOnly2: updateRestOnly2,
    getLastHistory: getLastHistory,
    getTodayHistory: getTodayHistory,
    getThreeHistory: getThreeHistory,
    getSubwayHistory: getSubwayHistory,
    verifyLimit: verifyLimit,
    createUserLog: createUserLog,
    createUserFeedback: createUserFeedback,
    getCountHistory: getCountHistory,
    getAllHistory: getAllHistory,
    getFeedbackInfo: getFeedbackInfo,
    getAllSubway: getAllSubway,
    getAllRestsaurant: getAllRestsaurant,
    updateClosedown: updateClosedown,
    verifySubway: verifySubway,

    createDecideHistory: createDecideHistory,
    getBeer:getBeer,
    getTwoBeer:getTwoBeer,
    updateBeerOnly2:updateBeerOnly2
}
