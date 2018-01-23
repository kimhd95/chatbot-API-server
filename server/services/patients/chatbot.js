const models = require('../../models');
const Op = models.sequelize.Op;

function getPatientChartURL (req, res){
	let kakao_id
	if (req.body){
		kakao_id = req.params.kakao_id
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id).'})
	}
	if (!kakao_id){
		return res.status(403).json({success: false, message: 'Kakao_id not given in parameter. Check parameters.'})
	}

	models.Patient.findOne({
		where: {
			kakao_id: kakao_id
		}
	}).then(patient => {
		if (patient){
			return res.status(403).json({success: false, message: 'patient with same kakao_id already exists'})
		} else {

			return res.status(200).json({success: true, message: 'patient found returning url.', url: 'https://jellyfi.jellylab.io/' + patient.kakao_id})

			// TODO: Create encrypted_kakao_id to protect raw kakao_id from being public.
			// return res.status(200).json({success: true, message: 'patient found returning url.', url: 'https://jellyfi.jellylab.io/' + patient.encrypted_kakao_id})

		}
	}).catch(function (err){
		return res.status(403).json({success: false, message: 'Error while searching for Patient with given kakao_id. err: ' + err.message})
	})
}

function registerPatient (req, res) {
	let kakao_id
	if (req.body){
		kakao_id = req.body.kakao_id
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id).'})
	}
	if (!kakao_id){
		return res.status(403).json({success: false, message: 'Kakao_id not given in Body. Check parameters.'})
	}

	models.Patient.findOne({
		where: {
			kakao_id: kakao_id
		}
	}).then(patient => {
		if (patient){
			return res.status(403).json({success: false, message: 'patient with same kakao_id already exists'})
		} else {
			models.Patient.create({
				kakao_id: kakao_id,
				scenario: '3',
				state: 'init'
			}).then(patient => {
				return res.status(201).json({success: true, message: 'patient created.', patient: patient})
			}).catch(function (err){
				return res.status(500).json({success: false, message: 'Error while creating Patient in DB.', error: err.message, err: err})
			});
		}
	})
}

function updatePatient (req, res) {
	console.log('updatePatient called.')
	let kakao_id

	if (req.body){
		kakao_id = req.body.kakao_id
		if (!kakao_id){
			return res.status(403).json({success: false, message: 'kakao_id not provided.'})
		}
	} else {
		return res.status(403).json({success: false, message: 'No input parameters received in body.'})
	}

	const name = req.body.name
	const fullname = req.body.fullname
	const email = req.body.email
	const doctor_code = req.body.doctor_code
	const phone = req.body.phone
	const sex = req.body.sex
	const birthday = req.body.birthday

	let param_name;
	let param_value;
	if (name){
		param_name = 'name'
		param_value = name
	} else if (fullname){
		param_name = 'fullname'
		param_value = fullname
	} else if (email) {
		param_name = 'patient_email'
		param_value = email
	} else if (doctor_code) {
		param_name = 'doctor_code'
		param_value = doctor_code
	} else if (phone) {
		param_name = 'phone'
		param_value = phone
	} else if (sex) {
		param_name = 'sex'
		param_value = sex
	} else if (birthday) {
		param_name = 'birthday'
		param_value = birthday
	}

	if (param_value){
		models.sequelize.query('UPDATE patients SET ' + param_name + " = '" + param_value + "' WHERE kakao_id = '" + kakao_id + "';").then(result => {
			if (result){
				console.log('result: ' + result.toString())
				return res.status(200).json({success: true, message: 'patient data updated. Result info: ' + result[0].info})
			} else {
				return res.status(403).json({success: false, message: 'patient update query failed.'})
			}
		}).catch(function (err){
			return res.status(403).json({success: false, message: 'Unknown error while querying patients table for update from ChatBot server. err: ' + err.message})
		})
	} else {
		return res.status(403).json({success: false, message: 'No parameter given. Please check again. Required: kakao_id. ' +
			'And one more parameter is required among name, fullname, email, doctor_code, phone, sex, birthday'})
	}
}


function getPatientInfo (req, res) {
	console.log('getPatientInfo called.')
	const kakao_id = req.params.kakao_id

	if (kakao_id) {
		models.Patient.findOne({
			where: {
				kakao_id: kakao_id
			}
		}).then(patient => {
			if (!patient){
				return res.status(403).json({success: false, message: 'patient not found with kakao_id: ' + kakao_id})
			}
			models.PatientLog.findAll({
				where: {
					kakao_id: kakao_id
				},
				order: [
					// Will escape username and validate DESC against a list of valid direction parameters
					['id', 'DESC']
				]
			}).then(patientLog => {
				console.log('patientLog findAll finished.')
				if (patientLog){
					console.log(patientLog);
					return res.status(200).json({success: true, message: 'patient and patient_log both found.', patient_info: patient, patient_log: patientLog})
				} else {
					// Return when no data found
					return res.status(403).json({success: false, message: 'No patientLog found with given kakao_id.'})
				}
			}).catch(function (err){
				return res.status(403).json({success: false, patient_info: patient, message: 'patient info found. But error occured while retrieving logs.', error: err.message})
			})
		}).catch(function (err){
			return res.status(403).json({success: false, message: err.message})
		})
	} else {
		return res.status(403).json({success: false, message: 'kakao_id not given.'})
	}
}

function createPatientLog (req, res){
	const kakao_id = req.body.kakao_id
	const scenario = req.body.scenario
	const state = req.body.state
	const content = req.body.content
	const date = req.body.date
	const type = req.body.type
	const answer_num = req.body.answer_num

	models.PatientLog.create({
		kakao_id: kakao_id,
		scenario: scenario,
		state: state,
		content: content,
		date: date,
		type: type,
		answer_num: answer_num
	}).then(patientLog => {

		models.Patient.update(
			{
				scenario: scenario,
				state: state
			},     // What to update
			{where: {
				kakao_id: kakao_id}
			})  // Condition
			.then(result => {
				return res.status(200).json({success: true, message: 'Patient Log and Patient both Update complete.', updateResult: result, patientLog: patientLog})
			}).catch(function (err){
				return res.status(403).json({success: false, message: 'Patient Log updated. However Patient Update failed. Error: ' + err.message, patientLog: patientLog})
			})

		// return res.status(201).json({success: true, patientLog})
	}).catch(function (err){
		return res.status(500).json({success: false, error: err.message})
	})
}


// Legacy code left here for reference.
function medicineTime (req, res) {

	const kakao_id = req.body.kakao_id.toString().trim() || '';
	if (!kakao_id) return res.status(400).json({error: 'Incorrect id'});

	const slot = req.body.slot.toString().trim() || '';
	const time = req.body.medicine_time.toString().trim() || '';


	models.Medicine_time.findOne({
		where: {
			kakao_id: kakao_id,
			slot: slot
		}
	}).then(medicine_time => {
		if (!medicine_time) {
			models.Medicine_time.create({
				kakao_id: kakao_id,
				slot: slot,
				time: time
			}).then(medicine_time => res.status(201).json(medicine_time));
		} else {

			if (!slot.length) return res.status(400).json({error: 'Incorrect'});
			if (!time.length) return res.status(400).json({error: 'Incorrect'});

			medicine_time.time = time;
			medicine_time.slot = slot;

			medicine_time.save().then(_ => res.status(201).json(medicine_time));

			const rule = new schedule.RecurrenceRule();
			rule.hour = parseInt(time);
			rule.minute = 0;

			scheduler = req.app.get('scheduler');

			if (scheduler[kakao_id][slot]) scheduler[kakao_id][slot].cancel();

			models.User.findOne({
				where: {
					kakao_id: kakao_id
				}
			}).then(user => {
				scheduler[kakao_id][slot] = schedule.scheduleJob(rule, function(){

					axios.post('https://openapi.bablabs.com/v2/kakao-talks', {
						phone_number:user.phone,
						message:'sdf'
					}, {
						headers: { Authorization: '456789' }
					}).then(response => {
						console.log(response.data.url);
						console.log(response.data.explanation);
					}).catch(error => {
						console.log(error);
					});
				});
			});
		}
	});
}


function getMedicineTime (req, res) {

	let kakao_id
	if ((req.params.kakao_id !== undefined)){
		kakao_id = req.params.kakao_id.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id).', kakao_id: req.params.kakao_id})
	}

	models.Medicine_time.findAll({
		where: {
			kakao_id: kakao_id
		}
	}).then(Medicine_time => {
		res.status(201).json({success: true, message: 'Medicine success', result: Medicine_time})
	}).catch(function (err){
		res.status(400).json({success: false, message: 'Get failed. Error: ' + err.message})
	})
}

function createMedicineTime (req, res) {

	let kakao_id, slot, time
	if ((req.body.kakao_id !== undefined) && (req.body.slot !== undefined) && (req.body.time !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		slot = req.body.slot.toString().trim() || '';
		time = req.body.time.toString().trim() || '';

		if (slot < 0 || slot >= 4 ){
			return res.status(403).json({success: false, message: 'Allowed Slot values are 0 (Morning), 1 (Lunch), 2 (Dinner), 3 (Before Sleep)'})
		}

	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, slot, time).', kakao_id: req.body.kakao_id, slot: req.body.slot, time: req.body.time})
	}

	models.Medicine_time.findOne({
		where: {
			kakao_id: kakao_id,
			slot: slot
		}
	}).then(med_time => {
		if (med_time){
			console.log('slot already exists for given kakao_id, slot. Updating value')
			med_time.slot = slot
			med_time.save().then(_ => {
				return res.status(201).json(med_time)
			}).catch(function (err){
				return res.status(500).json({success: false, message: 'slot already exists for given kakao_id and slot, but failed to update.', err: err.message})
			})
		} else {
			models.Medicine_time.create({
				kakao_id: kakao_id,
				slot: slot,
				time: time
			}).then(Medicine_time => {
				return res.status(201).json({success: true, result: Medicine_time})
			}).catch(function (err){
				return res.status(400).json({success: false, message: 'Slot does not exist for given kakao_id. However, create failed.', err: err.message})
			})
		}
	}).catch(function (err){
		return res.status(500).json({success: false, message: 'Create medicine time failed for some unknown reason.', err: err.message})
	})
}


// To be used for later.
function updateMedicineTimeMute (req, res) {

	let kakao_id, slot, time
	if ((req.body.kakao_id !== undefined) && (req.body.slot !== undefined) && (req.body.time !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		slot = req.body.slot.toString().trim() || '';
		time = req.body.time.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, slot, time).', kakao_id: req.body.kakao_id, slot: req.body.slot, time: req.body.time})
	}

	if (param_value){
		models.sequelize.query('UPDATE patients SET ' + param_name + " = '" + param_value + "' WHERE kakao_id = '" + kakao_id + "';").then(result => {
			if (result){
				return res.status(200).json({success: true, message: 'patient data updated. Result info: ' + result[0].info})
			} else {
				return res.status(403).json({success: false, message: 'patient update query failed.'})
			}
		}).catch(function (err){
			return res.status(403).json({success: false, message: 'Unknown error while querying patients table for update from ChatBot server. err: ' + err.message})
		})
	}
}

function getMedicineCheck (req, res) {

	let kakao_id
	if ((req.params.kakao_id !== undefined)){
		kakao_id = req.params.kakao_id.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id).', kakao_id: req.params.kakao_id})
	}

	models.Medicine_check.findAll({
		where: {
			kakao_id: kakao_id
		}
	}).then(Medicine_check => {
		res.status(201).json({success: true, result: Medicine_check})
	}).catch(function (err){
		res.status(400).json({success: false, message: 'Get failed. Error: ' + err.message})
	})
}

// Time은 UnixTime in seconds 로 한다 - Integer. - 기록할 당시의 유닉스시간
// Date는 (UnixTime in seconds) - (UnixTime in seconds % 60*60*24) 로 한다. 그 해당 날짜만 기록. (시간, 분, 초 를 제외한다.) - medicine_time 에서 약체크에 해당하는 날짜시간.
// Allowed Slot values are 0 (Morning), 1 (Lunch), 2 (Dinner), 3 (Before Sleep) - Integer
function createMedicineCheck (req, res) {

	let kakao_id, med_check, time, date, slot
	if ((req.body.kakao_id !== undefined) && (req.body.med_check !== undefined) && (req.body.time !== undefined) && (req.body.date !== undefined) && (req.body.slot !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		med_check = req.body.med_check.toString().trim() || '';
		time = req.body.time.toString().trim() || '';
		date = req.body.date.toString().trim() || '';
		slot = req.body.slot.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, med_check, time, date, slot).',
			kakao_id: req.body.kakao_id, med_check: req.body.med_check, time: req.body.time, date: req.body.date, slot: req.body.slot})
	}

	models.Medicine_check.create({
		kakao_id: kakao_id,
		med_check: med_check,
		time: time,
		date: date,
		slot: slot
	}).then(medicine_check => {
		res.status(201).json({success: true, result: medicine_check})
	}).catch(function (err){
		res.status(400).json({success: false, message: 'Create failed. Error: ' + err.message})
	})
}

function createMoodCheck (req, res) {

	let kakao_id, mood_check, type, time, text
	if ((req.body.kakao_id !== undefined) && (req.body.mood_check !== undefined) && (req.body.time !== undefined) && (req.body.type !== undefined) && (req.body.text !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		mood_check = req.body.mood_check.toString().trim() || '';
		type = req.body.type.toString().trim() || '';
		time = req.body.time.toString().trim() || '';
		text = req.body.text.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, med_check, time, text).',
			kakao_id: req.body.kakao_id, mood_check: req.body.mood_check, type: req.body.type, time: req.body.time})
	}

	models.Mood_check.create({
		kakao_id: kakao_id,
		mood_check: mood_check,
		type: type,
		time: time
	}).then(mood_check => {
		res.status(201).json({success: true, result: mood_check})
	}).catch(function (err){
		res.status(400).json({success: false, message: 'Create failed. Error: ' + err.message})
	})

}


// Integrated into createMoodCheck. Unused now.
function createMoodCheckText (req, res){
	let kakao_id, mood_check_id, text;
	if ((req.body.kakao_id !== undefined) && (req.body.mood_check_id !== undefined) && (req.body.text !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		mood_check_id = req.body.mood_check_id.toString().trim() || '';
		text = req.body.text.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, mood_check_id, text).', kakao_id: req.body.kakao_id, mood_check_id: req.body.mood_check_id, text: req.body.text})
	}

	models.Mood_check.update(
		{mood_text: text},
		{where: {
				kakao_id: kakao_id,
				id: mood_check_id,
			}
		}
	).then(mood_check => res.status(200).json({success: true, message: 'Update done. mood_check: ' + mood_check.toString()})
	).catch(function (err){
		res.status(400).json({success: false, message: 'Updated failed. Error: ' + err.message})
	})
}

// 환자가 챗봇으로 약체크를 할 때, 이전 이틀동안 최대 3회 약체크 null data 가 있을 경우 그 time slot 을 가져와 챗봇 서버에 알려준다. 그러면 챗봇 서버는 환자에거게 적절한 약체크 질문을 던진다. date 는 unixtime in seconds
function getMedicineTimeToCheck (req, res) {

	let kakao_id, time
	if ((req.params.kakao_id !== undefined) && (req.params.time !== undefined)){
		// kakao_id = req.body.kakao_id.toString().trim() || '';
		// time = req.body.time.toString().trim() || '';
		kakao_id = req.params.kakao_id
		time = req.params.time
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, time).',
			kakao_id: req.body.kakao_id, date: req.body.time})
	}

	models.Medicine_time.findAll({
		where: {
			kakao_id: kakao_id
		},
		order: [
			['slot', 'DESC']
		]
	}).then(Medicine_time => {


		// 메디신 타임을 다 가져와서, 메디신 체크에 원래 체크를 해야 하는 날짜와 타임슬롯에 데이터가 실제로 존재하는지 확인.
		models.Medicine_check.findAll({
			where: {
				kakao_id: kakao_id,
				// med_check: {[Op.ne]: null}, // 데이터가 있는 경우 다 가져온다. med_check 가 null 일 수가 없기에 주석처리 함. (환자가 체크를 하지 않았으면 row 자체가 생성되지 않았을 것이기에.)
				date: {   // 주의: time 은 콜 했을 당시의 유닉스 시간. date 는 medicine_check 데이터 내에서 해당하는 날짜.
					[Op.lt]: time,
					[Op.gte]: time - (time % 60*60*24) // 오늘
				}
			},
			order: [
				// Will escape username and validate DESC against a list of valid direction parameters
				['time', 'DESC']
			]
			// limit: 8 // 이전 8회까지만.
		}).then(med_check => {

			let expectedValues = [];
			for (let i=0; i<Medicine_time.length; i++){
				// if (med_check.slot) Medicine_time[i].slot
				// if (med_check)
				expectedValues.push({date: time - (time % 60*60*24), slot: Medicine_time[i].slot})  // 오늘
				expectedValues.push({date: time - (time % 60*60*24) - 60*60*24, slot: Medicine_time[i].slot}) // 어제
			}

			for (let j=0; j<med_check.length; j++){
				for (let k=0; k < expectedValues.length; k++){
					if (expectedValues[k].date === med_check[j].date && expectedValues[k].slot === med_check[j].slot){
						expectedValues.splice(k, 1)
					}
				}
			}

			return res.status(200).json({success: true, message: 'successfully retrieved data.', med_time: Medicine_time, med_check: med_check, toAskValues: expectedValues})
		}).catch(err => {
			res.status(400).json({success: false, message: 'Failed. Error: ' + err.message})
		})
	}).catch(function (err){
		res.status(400).json({success: false, message: 'Failed. Error: ' + err.message})
	})
}


module.exports = {
	getPatientChartURL: getPatientChartURL,

	registerPatient: registerPatient,
	updatePatient: updatePatient,
	getPatientInfo: getPatientInfo,
	createPatientLog: createPatientLog,

	createMedicineTime: createMedicineTime,
	getMedicineTime: getMedicineTime,
	// updateMedicineTime: updateMedicineTime,

	createMedicineCheck: createMedicineCheck,
	getMedicineCheck: getMedicineCheck,
	createMoodCheck: createMoodCheck,
	createMoodCheckText: createMoodCheckText,
	getMedicineTimeToCheck: getMedicineTimeToCheck,
}