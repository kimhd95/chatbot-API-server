const models = require('../../models');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

const timeGapToCheckMedicineCheckConnection = 1000 * 60* 30 // 30 minutes.

function now(date) {
	const m = date.getMonth()+1;
	const d = date.getDate();
	const h = date.getHours();
	const i = date.getMinutes();
	const s = date.getSeconds();
	// return date.getFullYear()+'-'+(m>9?m:'0'+m)+'-'+(d>9?d:'0'+d)+' '+(h>9?h:'0'+h)+':'+(i>9?i:'0'+i)+':'+(s>9?s:'0'+s);
	return date.getFullYear()+'-'+m+'-'+d+' '+h+':'+i+':'+s;
}

const NOTFOUND = {
	message: 'Not Found',
	documentation_url: 'http://localhost:8000/request',
}

function getPatients(req, res) {
	models.Patient.findAll({
	}).then(result => {
		res.json(result);
	})
}

function getPatientWithId(req, res) {
	models.Patient.findOne({
		where: {
			kakao_id: req.body.kakao_id
		}
	}).then(result => {
		res.json(result);
	})
}

function registerKakaoId (req, res) {

	let kakao_id, phone, name
	if (req.body.kakao_id && req.body.phone && req.body.name){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		phone = req.body.phone.toString().trim() || '';
		name = req.body.name.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, phone, name).'})
	}

	if (!kakao_id) return res.status(400).json({error: 'kakao_id not given.'});

	models.Patient.create({
		kakao_id: kakao_id,
		phone: phone,
		name: name
	}).then(patient => {
		return res.status(201).json(patient)
	}).catch(function (err){
		return res.status(500).json({error: err.message})
	});
}

function registerDoctorCode (req, res){

	let kakao_id, doctor_code;
	if (!(req.body.kakao_id && req.body.doctor_code)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		doctor_code = req.body.doctor_code.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, doctor_code).', kakao_id: req.body.kakao_id, doctor_cod: req.body.doctor_code})
	}
	// const kakao_id = req.body.kakao_id.toString().trim() || '';
	// if (!kakao_id) return res.status(400).json({error: 'kakao_id not given.'});
	// const doctor_code = req.body.doctor_code.toString().trim() || '';

	models.Patient.update(
		{doctor_code: doctor_code},     // What to update
		{where: {kakao_id: kakao_id}})  // Condition
		.then(result => {
			res.status(200).json({success: true, message: 'Update complete. Result: ' + result.toString()})
	}).catch(function (err){
		res.status(500).json({success: false, message: 'Updated failed. Error: ' + err.message})
	})
}

function kakaoText (req, res) {

	let kakao_id, text, time, type
	if (req.body.kakao_id && req.body.text && req.body.time && (req.body.type !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		text = req.body.text.toString().trim() || '';
		time = req.body.time.toString().trim() || '';
		type = req.body.type.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, text, time, type).', kakao_id: req.body.kakao_id, text: req.body.text, time: req.body.time, type: req.body.type})
	}

	// const kakao_id = req.body.kakao_id.toString().trim() || '';
	// if (!kakao_id) return res.status(400).json({error: 'Kakao Id not given'});
	// const text = req.body.text.toString().trim() || '';
	// const time = req.body.time.toString().trim() || '';
	// const type = req.body.type.toString().trim() || '';

	models.Kakao_text.create({
		kakao_id: kakao_id,
		text: text,
		time: time,
		share_doctor: type
	}).then(patient => res.status(201).json(patient));
}

function medicineCheck (req, res) {

	let kakao_id, med_check, time
	if ((req.body.kakao_id !== undefined) && (req.body.med_taken !== undefined) && (req.body.time !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		med_check = req.body.med_taken.toString().trim() || '';
		time = req.body.time.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, text, time, type).', kakao_id: req.body.kakao_id, med_taken: req.body.med_taken, time: req.body.time})
	}

	// const kakao_id = req.body.kakao_id.toString().trim() || '';
	// if (!kakao_id) return res.status(400).json({error: 'Kakao Id not given'});
	// const time = req.body.time.toString().trim() || '';
	// const med_check = req.body.med_taken.toString().trim() || '';

	models.Medicine_check.create({
		kakao_id: kakao_id,
		med_check: med_check,
		time: time
	}).then(medicine_check => res.status(201).json(medicine_check))
		.catch(function (err){
			res.status(400).json({success: false, message: 'Updated failed. Error: ' + err.message})
		})

	// models.Medicine_check.findAndCountAll({
	// 	kakao_id: kakao_id,
	// 	med_check: '1',
	// 	time: {
	// 		[Op.between]: [now(new Date(Date.now() - 7 * 24 * 3600 * 1000)), now(new Date())]
	// 	}
	// }).then(result => {
	//
	// 	Patient.update({
	// 		medicine_week: parseInt(result.count*100/7.0),
	// 	}, {
	// 		where: {
	// 			kakao_id: kakao_id,
	// 		}
	// 	});
	// });
}

function medicineCheckMissReason(req, res){

	let kakao_id, text;
	if ((req.body.kakao_id !== undefined) && (req.body.text !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		text = req.body.text.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, text, time).', kakao_id: req.body.kakao_id, text: req.body.text})
	}

	// const kakao_id = req.body.kakao_id.toString().trim() || '';
	// if (!kakao_id) return res.status(400).json({error: 'Kakao Id not given'});
	// const text = req.body.text.toString().trim() || '';

	models.Medicine_check.update(
		{med_miss_reason: text},
		{where: {
			kakao_id: kakao_id,
			time: {[Op.between]: [now(new Date(Date.now() - timeGapToCheckMedicineCheckConnection)), now(new Date())]},
			med_check: {[Op.ne]: 1}
			}
		} // within 30 minutes of call
	).then(medicine_check => res.status(200).json({success: true, message: 'Update done. medicine_check: ' + medicine_check.toString()})
	).catch(function (err){
		res.status(400).json({success: false, message: 'Updated failed. Error: ' + err.message})
	})
}

function medicineCheckMedSide(req, res){

	let kakao_id, text;
	if ((req.body.kakao_id !== undefined) && (req.body.text !== undefined)){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		text = req.body.text.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, text).', kakao_id: req.body.kakao_id, text: req.body.text})
	}

	//
	// const kakao_id = req.body.kakao_id.toString().trim() || '';
	// if (!kakao_id) return res.status(400).json({error: 'Kakao Id not given'});
	// const text = req.body.text.toString().trim() || '';

	models.Medicine_check.update(
		{med_side: text},
		{where: {
				kakao_id: kakao_id,
				time: {[Op.between]: [now(new Date(Date.now() - timeGapToCheckMedicineCheckConnection)), now(new Date())]}, // within 30 minutes of api call
				med_check: {[Op.ne]: 1}
			}
		}
	).then(medicine_check => res.status(200).json({success: true, message: 'Update done. medicine_check: ' + medicine_check.toString()})
	).catch(function (err){
		res.status(400).json({success: false, message: 'Updated failed. Error: ' + err.message})
	})
}

function medicineCheckMedSideDegree(req, res){

	let kakao_id, text;
	if (req.body.kakao_id && req.body.text){
		kakao_id = req.body.kakao_id.toString().trim() || '';
		text = req.body.text.toString().trim() || '';
	} else {
		return res.status(400).json({success: false, message: 'Parameters not properly given. Check parameter names (kakao_id, text).', kakao_id: req.body.kakao_id, text: req.body.text})
	}

	// const kakao_id = req.body.kakao_id.toString().trim() || '';
	// if (!kakao_id) return res.status(400).json({error: 'Kakao Id not given'});
	// const text = req.body.text.toString().trim() || '';

	models.Medicine_check.update(
		{med_side_degree: text},
		{where: {time: {[Op.between]: [now(new Date(Date.now() - timeGapToCheckMedicineCheckConnection)), now(new Date())]}}} // within 30 minutes of call
	).then(medicine_check => res.status(200).json({success: true, message: 'Update done. medicine_check: ' + medicine_check.toString()})
	).catch(function (err){
		res.status(400).json({success: false, message: 'Updated failed. Error: ' + err.message})
	})
}

function moodCheck (req, res) {
	const kakao_id = req.body.kakao_id.toString().trim() || '';
	if (!kakao_id) return res.status(400).json({error: 'Incorrect id'});
	const mood_check = req.body.value.toString().trim() || '';
	const time = req.body.time.toString().trim() || '';
	const type = req.body.type.toString().trim() || '';

	models.Mood_check.create({
		kakao_id: kakao_id,
		mood_check: mood_check,
		type: type,
		time: time
	}).then(mood_check => res.status(201).json(mood_check)
	).catch(function (err){
		res.status(400).json({success: false, message: 'Updated failed. Error: ' + err.message})
	})
}

function setMoodCheckReason(req, res){
	const kakao_id = req.body.kakao_id.toString().trim() || '';
	if (!kakao_id) return res.status(400).json({error: 'Kakao Id not given'});
	const text = req.body.text.toString().trim() || '';

	models.Mood_check.update(
		{mood_text: text},
		{where: {time: {[Op.between]: [now(new Date(Date.now() - timeGapToCheckMedicineCheckConnection)), now(new Date())]}}}
	).then(mood_check => res.status(200).json({success: true, message: 'Update done. mood_check: ' + mood_check.toString()})
	).catch(function (err){
		res.status(400).json({success: false, message: 'Updated failed. Error: ' + err.message})
	})
}

// TODO: Develop later. Not used now
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
};

// TODO: Deprecated

function medicineSide (req, res) {

	const kakao_id = req.body.kakao_id.toString().trim() || '';
	if (!kakao_id) return res.status(400).json({error: 'Incorrect id'});

	const time = req.body.time.toString().trim() || '';
	const text = req.body.text.toString().trim() || '';

	models.Medicine_side.create({
		kakao_id: kakao_id,
		text: text,
		time: time
	}).then(medicine_side => res.status(201).json(medicine_side));

};

function medicineMiss (req, res) {
	const kakao_id = req.body.kakao_id.toString().trim() || '';
	if (!kakao_id) return res.status(400).json({error: 'Incorrect id'});

	const text = req.body.text.toString().trim() || '';
	const time = req.body.time.toString().trim() || '';

	models.Medicine_miss.create({
		kakao_id: kakao_id,
		med_check: text,
		time: time
	}).then(medicine_miss => res.status(201).json(medicine_miss));

};

// TODO: Empty functions below

function interviewTime (req, res) {
};

function interviewCheck (req, res) {
};

module.exports = {
	getPatients: getPatients,
	getPatientWithId: getPatientWithId,

	// Below methods requires APIKey.
	registerKakaoId: registerKakaoId,
	registerDoctorCode: registerDoctorCode,
	kakaoText: kakaoText,
	medicineCheck: medicineCheck,
	medicineCheckMissReason: medicineCheckMissReason,
	medicineCheckMedSide: medicineCheckMedSide,
	medicineCheckMedSideDegree: medicineCheckMedSideDegree,

	moodCheck: moodCheck,
	moodCheckReason: setMoodCheckReason,

	// medicineTime: medicineTime,
	// medicineMiss: medicineMiss,
	// medicineSide: medicineSide,
	// interviewTime: interviewTime,
	// interviewCheck: interviewCheck
};
