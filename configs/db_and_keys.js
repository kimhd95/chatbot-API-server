const productionKeys = require('./production_keys')

const environments = {
	local: {
		mysql: {
			host: 'dev-jellylab-database-nodered.cgrre2ngqldq.ap-northeast-2.rds.amazonaws.com',
			username: 'jellylab',
			password: 'jellylab',
			database: 'Dev_Jellylab_DB_NodeRed',
			logging: console.log
		},
		apikey: '9Y3-7bE-Ud3-7Ja',
		jwt_secret: "9Y3-7bE-Ud3-7Ja"
	},
	dev: {
		mysql: {
			host: 'dev-jellylab-database-nodered.cgrre2ngqldq.ap-northeast-2.rds.amazonaws.com',
			username: 'jellylab',
			password: 'jellylab',
			database: 'Dev_Jellylab_DB_NodeRed',
			logging: console.log
		},
		apikey: '9Y3-7bE-Ud3-7Ja',
		jwt_secret: "9Y3-7bE-Ud3-7Ja"
	},
	qa: {
		mysql: {
			host: '<QA DB SERVER HOST HERE>',
			username: 'jellylab',
			password: '<QA PASSWORD HERE>',
			database: '<QA DB SERVER DB NAME HERE>',
			logging: console.log
		},
		apikey: '9Y3-7bE-Ud3-7Ja',
		jwt_secret: "9Y3-7bE-Ud3-7Ja"
	},
	production: {
		mysql: {
			host: productionKeys.prodDBHost,
			username: productionKeys.prodDBUserName,
			password: productionKeys.prodDBKey,
			database: productionKeys.prodDBDatabase,
			logging: console.log
		},
		apikey: productionKeys.prodAPIKey,
		jwt_secret: productionKeys.prodJWTKey
	}
}

const nodeEnv = process.env.NODE_ENV || 'local';
module.exports = environments[nodeEnv];