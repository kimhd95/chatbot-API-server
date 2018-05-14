/**
 * Doctor API authentication part
 *
 * @date 2018-01-04
 * @author 김지원
 * @updated 2018-01-15
 * @updated_by 김지원
 * @update_log verifyToken & checkTokenVerified updated.
 *
 * Refer to https://www.npmjs.com/package/jsonwebtoken for jwt.
 */

'use strict';

const qs = require('qs');
const jwt = require('jsonwebtoken');
const models = require('../../models');
const config = require('../../../configs');
const bcrypt = require('bcrypt');
var logger = require('../../config/winston');

// Constants
const EnumRoleType = {
    ADMIN: 'admin',
    DEFAULT: 'guest',
    DEVELOPER: 'developer',
    DOCTOR: 'doctor'
}
const userPermission = {
    DEFAULT: {
        visit: ['dashboard', 'patients', 'add patient'],
        role: EnumRoleType.DEFAULT,
    },
    ADMIN: {
        role: EnumRoleType.ADMIN,
    },
    DEVELOPER: {
        role: EnumRoleType.DEVELOPER,
    },
    DOCTOR: {
        role: EnumRoleType.DOCTOR,
    },
}

// verifyToken is mainly used for initial authentication purposes.
// For example, to determine whether the browser is already "logged in" or not.
// For general authentication purposes, calling the APIs directly will suffice.
// This is because "checkTokenVerified" is called as a middleware for APIs that need authentication.
function verifyToken (req, res){
    const cookie = req.cookies || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;

    const secret = config.jwt_secret;

    console.log('cookie: ' + cookie)
    console.log('token: ' + token)

    // decode token
    if (token) {
        console.log('token given.')

        // verifies secret and checks exp
        jwt.verify(token, secret, function(err, decoded) {
            if (err) {
                // remove token in Cookie
                res.clearCookie('token');
                return res.status(403).json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
            } else {
                // if everything is good, renew token in cookie and save decoded payload to request for use in other routes

                models.Doctor.findOne({
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
            // return res.status(403).json({success: true, message: 'Given token is verified, but Cookie token renew failed.'})
        })
    } else {
        // return an error if there is no token
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

function doctorEmailDuplicateCheck (req, res){
    const email = req.body.email.toString() || '';
    if (!email.length) {
        return res.status(400).json({exists: null, message: 'Email not provided.'});
    }
    models.Doctor.findOne({
        where: {
            email: email
        }
    }).then(doctor => {
        console.log('email: ' + email)
        if (doctor){console.log('doctor.email: ' + doctor.email)} else {
            console.log('No doctor found with given email.')
        }
        if (doctor) {
            console.log("Email already exists: ")
            res.status(200).json({exists: true, message: 'Email already exists.'})
        } else {
            res.status(200).json({exists: false, message: 'Email is unique. Good to proceed.'})
        }
    }).catch(function (err){
        console.log('ERROR while checking duplicate email')
        res.status(500).json({exists: null, message: 'Internal server DB error. err: ' + err.message, devLog: 'email given: ' + email})
    })
}

function registerDoctor (req, res){
    const email = req.body.email || ''
    const password = req.body.password
    const hospital = req.body.hospital
    const name = req.body.name

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
    if(! password.length >=6 ){
        return res.status(400).json({success: false, error: 'Password needs to be longer than 6 alphanumeric characters.'});
    }

    // Check if password > 6 alphanumeric
    let letter = /[a-zA-Z]/;
    let number = /[0-9]/;
    let valid = number.test(password) && letter.test(password); //match a letter _and_ a number
    if (!valid){
        return res.status(400).json({success: false, message: 'Password requires at least one character and one digit.'})
    }

    // Generate doctor_code
    let doctor_code = Math.floor(Math.random() * 999999) + 1

    new Promise(function(resolve, reject) {
        // create function for recursive call to avoid asynchronous problems
        function generateUniqueDoctorCode(doctor_code){
            models.Doctor.findOne({
                where: {
                    doctor_code: doctor_code.toString()
                }
            }).then(doctor => {
                if (doctor) { // newly generated doctor_code already exists.
                    console.log("doctor.doctor_code already exists: " + doctor.doctor_code)
                    // Generate new doctor_code
                    doctor_code = Math.floor(Math.random() * 999999) + 1
                    generateUniqueDoctorCode(doctor_code)
                } else {
                    console.log("doctor_code is unique: " + doctor_code)
                    resolve(doctor_code)
                }
            }).catch(function (err){
                console.log('ERROR WHILE generateUniqueDoctorCode()')
                reject(err)
            })
        }
        doctor_code = generateUniqueDoctorCode(doctor_code)
    }).then(function (doctor_code){

        var SALT_FACTOR = 5;
        bcrypt.hash(password, SALT_FACTOR, function(err, hash) {
            if(err) {
                console.log('ERROR WHILE GENERATING PASSWORD',err);
                reject(err)
            }
            models.Doctor.create({
                email: email,
                password: hash,
                doctor_code: doctor_code,
                hospital: hospital,
                name: name
            }).then(doctor => {
                res.status(201).json({success: true, message: 'Ok'})
            }).catch(function (err) {
                if (err) res.status(500).json({
                    success: false,
                    message: err.message,
                    log: 'Error while creating doctor row in db. check uniqueness of parameters.'
                });
            });
        });
    }).catch(function (err){
        res.status(500).json({
            success: false,
            message: err.message
        })
    })
}

function loginDoctor (req, res){
    const email = req.body.email
    const password = req.body.password
    const secret = config.jwt_secret

    if (!email){
        return res.status(400).json({success: false, message: 'Email not given.'});
    }

    models.Doctor.findOne({
        where: {
            email: email
        }
    }).then(doctor => {
        if (!doctor) {
            return res.status(403).json({success: false, message: 'No doctor account found with given email address.'});
        }
        if (doctor.password === password) {
            jwt.sign({
                    id: doctor.id,
                    permissions: userPermission.DEVELOPER,
                    email: doctor.email,
                    doctor_code: doctor.doctor_code,
                    hospital: doctor.hospital,
                    name: doctor.name
                },
                secret, {
                    expiresIn: '7d',
                    issuer: 'jellylab.io',
                    subject: 'userInfo'
                }, (err, token) => {
                    console.log('err: ' + err, ', token: ' + token);
                    if (err) {
                        console.log('err.message: ' + err.message);
                        return res.status(403).json({
                            success: false,
                            message: err.message
                        });
                    }
                    // Refer to https://stackoverflow.com/questions/1062963/how-do-browser-cookie-domains-work/30676300#30676300 for cookie settings.
                    // And https://stackoverflow.com/questions/1134290/cookies-on-localhost-with-explicit-domain for localhost config.
                    console.log('req.header.origin = ' + req.header('origin'))

                    const cookieMaxAge = 1000 * 60 * 60 * 24 * 7;
                    if (req.header('origin') === undefined){
                        console.log('req origin is undefined. Probably from postman.')
                        if (req.secure) {
                            console.log('req is secure')
                            res.cookie('token', token, {maxAge: cookieMaxAge, secure: true})
                        } else {
                            console.log('req is NOT secure')
                            res.cookie('token', token, {maxAge: cookieMaxAge, secure: false})
                        }
                    } else if (req.header('origin').includes('localhost')) {
                        console.log('req origin includes localhost OR it is from postman.')
                        if (req.secure) {
                            console.log('req is secure')
                            res.cookie('token', token, {maxAge: cookieMaxAge, secure: true})
                        } else {
                            console.log('req is NOT secure')
                            res.cookie('token', token, {maxAge: cookieMaxAge, secure: false})
                        }
                    } else {
                        console.log('req origin does NOT include localhost')
                        if (req.secure) {
                            res.cookie('token', token, {maxAge: cookieMaxAge, secure: true})
                        } else {
                            res.cookie('token', token, {maxAge: cookieMaxAge, secure: false})
                        }
                    }
                    res.header('Access-Control-Allow-Credentials', 'true');
                    return res.status(200).json({success: true, message: 'Ok', token: token, redirect:'/dashboard'});
                });
        } else {
            return res.status(403).json({
                success: false,
                message: 'Password wrong'
            });
        }
    }).catch(function (err){
        console.log('err.message: ' + err.message);
        return res.status(403).json({
            success: false,
            message: 'DB error. err: ' + err.message
        })
    });
}

function logoutDoctor (req, res) {
    const cookie = req.cookies || req.headers.cookie || '';
    const cookies = qs.parse(cookie.replace(/\s/g, ''), { delimiter: ';' });
    let token = cookies.token;
    const secret = config.jwt_secret;

    if (token) {
        jwt.verify(token, secret, function(err, decoded) {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token. err: ' + err.message });
            } else {
                res.clearCookie('token');
                const aftertoken = cookies.token;
                return res.status(200).json({success: true});
            }
        });
    } else {
        res.clearCookie('token');
        return res.status(403).send({
            success: false,
            message: 'No token given.'
        });
    }
}

function updateHospital (req, res) {
    const email = req.body.email
    const curPassword = req.body.password
    const newHospital = req.body.hospital_new
    if (!email) return res.status(400).json({success: false, message: 'email not provided.'});

    models.Doctor.findOne({
        where: {
            email: email
        }
    }).then(doctor => {
        if (!doctor) {
            return res.status(200).json({success: true, message: 'Hospital successfully updated.'})
        }

        if (doctor.password === curPassword){
            doctor.hospital = newHospital
            doctor.save().then(_ => {
                return res.status(200).json({success: true, message: 'Hospital successfully updated.'})
            })
        } else {
            return res.status(403).json({success: false, message: 'Given current password is wrong.'})
        }
    });
}

function updatePassword (req, res) {
    const email = req.body.email
    const curPassword = req.body.password_current
    const newPassword = req.body.password_new


    if (!email) return res.status(400).json({success: false, message: 'email not provided.'});

    // Check if newPassword arrived
    if (!newPassword.length) {
        return res.status(400).json({success: false, error: 'newPassword not given'});
    }

    // Check if newPassword > 6 alphanumeric
    if(! newPassword.length >=6 ){
        return res.status(400).json({success: false, error: 'newPassword needs to be longer than 6 alphanumeric characters.'});
    }

    // Check if newPassword > 6 alphanumeric
    let letter = /[a-zA-Z]/;
    let number = /[0-9]/;
    let valid = number.test(newPassword) && letter.test(newPassword); //match a letter _and_ a number
    if (!valid){
        return res.status(400).json({success: false, message: 'newPassword requires at least one character and one digit.'})
    }

    models.Doctor.findOne({
        where: {
            email: email
        }
    }).then(doctor => {
        if (!doctor) {
            return res.status(404).json({error: 'No user with given email address.'});
        }

        if (doctor.password === curPassword){
            doctor.password = newPassword
            doctor.save().then(_ => {
                return res.status(200).json({success: true, message: 'Password successfully updated.'})
            })
        } else {
            return res.status(403).json({success: false, message: 'Given current password is wrong.'})
        }
    });
}

function deleteDoctor (req, res) {
    const email = req.body.email
    const password = req.body.password
    if (!email) return res.status(400).json({success: false, message: 'Email not provided.'})

    models.Doctor.find({
        where: {
            email: email
        }
    }).then(doctor => {
        console.log('doctor with given email found')
        if (!doctor){
            return res.status(403).json({success: false, message: 'No doctor account with given email address found'})
        } else {
            if (doctor.password !== password){
                return res.status(403).json({success: false, message: 'The given password does not match with the account password.'})
            } else {
                models.Doctor.destroy({
                    where: {
                        email: email,
                        password: password
                    }
                }).then(result => {
                    console.log('Doctor.destroy result: ' + result)

                    if (result === 0){
                        return res.status(403).json({success: false, message: 'Doctor email and password match. But somehow the delete failed.'})
                    } else {
                        res.clearCookie('token');
                        return res.status(200).json({success: true, message: 'Doctor account successfully deleted.'})
                    }

                }).catch(function (err){
                    return res.status(403).json({success: false, message: 'Unknown inner catch error on Doctor.destroy. err: ' + err.message})
                })
            }
        }
    }).catch(function (err){
        return res.status(403).json({success: false, message: 'Unknown outer catch error. err: ' + err.message})
    })
}

module.exports = {
    verifyToken: verifyToken,
    checkTokenVerified: checkTokenVerified,
    registerDoctor: registerDoctor,
    loginDoctor: loginDoctor,
    logoutDoctor: logoutDoctor,
    doctorEmailDuplicateCheck: doctorEmailDuplicateCheck,
    updatePassword: updatePassword,
    deleteDoctor: deleteDoctor,
    updateHospital: updateHospital,
};