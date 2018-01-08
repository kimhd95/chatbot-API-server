const Sequelize = require('sequelize');
const config = require('../../configs')

const verifyAPIKEY = (req, res, next) => {

	if(!req.body.apikey) {
		console.log(req.body.apikey);
		return res.status(400).send('Something broke!');
	}

	console.log(req.body);
	const apikey = req.body.apikey.toString().trim() || '';
	if(apikey!=config.apikey)
		return res.status(400).send('Something broke!');

	next();
}

const sequelize = new Sequelize(
	config.mysql.database,
	config.mysql.username,
	config.mysql.password, {
		logging: config.mysql.logging,
		host: config.mysql.host,
		dialect: 'mysql',

		define: {
			// don't add the timestamp attributes (updatedAt, createdAt)
			timestamps: false,

			// don't delete database entries but set the newly added attribute deletedAt
			// to the current date (when deletion was done). paranoid will only work if
			// timestamps are enabled
			paranoid: false,

			// don't use camelcase for automatically added attributes but underscore style
			// so updatedAt will be updated_at
			underscored: true,

			// disable the modification of tablenames; By default, sequelize will automatically
			// transform all passed model names (first parameter of define) into plural.
			// if you don't want that, set the following
			freezeTableName: false,
		}

	}

);

const Patient = sequelize.define('patient', {
	username: Sequelize.STRING,
	fullname: Sequelize.STRING,
	patient_email: Sequelize.STRING,
	patient_password: Sequelize.STRING,
	kakaoid: { type: Sequelize.STRING, allowNull: false, unique: true },
	doctor_code: Sequelize.STRING,
	registered: Sequelize.STRING,
	phone: Sequelize.STRING,
	sex: Sequelize.STRING,
	birthday: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },

	// medicine_side: Sequelize.STRING,

	createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
	updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
});

const Doctor = sequelize.define('doctor', {
	doctor_code: { type: Sequelize.STRING, allowNull: false, unique: true },
	email:Sequelize.STRING,
	password: Sequelize.STRING,
	hospital: Sequelize.STRING,
	name: Sequelize.STRING,
	createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
	updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
});

const Medicine_check = sequelize.define('medicine_check', {
	kakaoid: Sequelize.STRING,
	med_check: Sequelize.STRING,
	time: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
	med_miss: Sequelize.STRING,
	if_med_side_text: Sequelize.STRING,
	med_side_degree: Sequelize.STRING,
});

const Medicine_time = sequelize.define('medicine_time', {
	kakaoid: Sequelize.STRING,
	slot: Sequelize.STRING,
	time: Sequelize.STRING,
	mute: Sequelize.STRING,
	createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
	updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
});

const Mood_check = sequelize.define('mood_check', {
	kakaoid: Sequelize.STRING,
	time: Sequelize.STRING,
	type: Sequelize.STRING,
	mood_check: Sequelize.STRING,
	mood_text: Sequelize.STRING
});

const Kakao_text = sequelize.define('kakao_text', {
	kakaoid: Sequelize.STRING,
	time: Sequelize.STRING,
	text: Sequelize.STRING,
	share_doctor: Sequelize.STRING
});

module.exports = {
	sequelize: sequelize,
	Patient: Patient,
	Doctor: Doctor,
	Medicine_check: Medicine_check,
	Medicine_time: Medicine_time,
	Mood_check: Mood_check,
	Kakao_text: Kakao_text,
	verifyAPIKEY: verifyAPIKEY
}
