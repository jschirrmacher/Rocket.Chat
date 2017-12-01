/* globals SystemLogger, RocketChat */

class SmartiAdapter {
	constructor(adapterProps) {

		this.properties = adapterProps;
		this.properties.url = this.properties.url.toLowerCase();

		this.options = {};
		this.options.headers = {};
		this.options.headers['content-Type'] = 'application/json; charset=utf-8';
		if (this.properties.token) {
			this.options.headers['authorization'] = `basic ${ this.properties.token }`;
		}
		if (this.properties.url.substring(0, 4) === 'https') {
			this.options.cert = `~/.nodeCaCerts/${ this.properties.url.replace('https', '') }`;
		}
	}

	onMessage(message) {

		//TODO is this always a new one, what about update

		const helpRequest = RocketChat.models.HelpRequests.findOneByRoomId(message.rid);

		const supportArea = helpRequest ? helpRequest.supportArea : undefined;

		const requestBody = {
			webhook_url: this.properties.webhookUrl,
			message_id: message._id,
			channel_id: message.rid,
			user_id: message.u._id,
			// username: message.u.username,
			text: message.msg,
			timestamp: message.ts,
			origin: message.origin,
			support_area: supportArea
		};
		const headers = {
			'X-Auth-Token': RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token'),
			'Content-Type': 'application/json'
		};

		try {
			const options = this.options;
			this.options.data = requestBody;
			this.options.headers = headers;
			SystemLogger.debug('Smarti - trigger analysis:', JSON.stringify(options, null, 2));

			const URL = `${ this.properties.url }rocket/${ RocketChat.settings.get('Assistify_AI_Smarti_Domain') }`;
			SystemLogger.info(`Send post request: ${ URL } with options: ${ JSON.stringify(options, null, 2) }`);
			const response = HTTP.post(URL, options);

			if (response.statusCode === 200) {
				SystemLogger.debug('Smarti - analysis triggered successfully:', JSON.stringify(response, null, 2));
			} else {
				SystemLogger.error('Smarti - analysis triggering failed:', JSON.stringify(response, null, 2));
			}
		} catch (e) {
			SystemLogger.error(`Smarti response for ${ URL } did not succeed:`, e);
		}
	}

	onClose(room) { //async
		//TODO add options here?
		//get conversation id
		const m = RocketChat.models.LivechatExternalMessage.findOneById(room._id);

		if (m) {
			const headers = {
				'X-Auth-Token': RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token'),
				'Content-Type': 'application/json'
			};
			try {
				const options = this.options;
				this.options.headers = headers;

				const URL = `${ this.properties.url }conversation/${ m.conversationId }/publish`;
				SystemLogger.info(`Send post request: ${ URL } with options: ${ JSON.stringify(options, null, 2) }`);
				const response = HTTP.post(URL, options);

				if (response.statusCode === 200) {
					SystemLogger.debug('Smarti - closed room successfully:', room._id, JSON.stringify(response, null, 2));
				} else {
					SystemLogger.error('Smarti - closing room failed:', room._id, JSON.stringify(response, null, 2));
				}
			} catch (e) {
				SystemLogger.error(`Smarti response for ${ URL } did not succeed:`, e);
			}
		} else {
			SystemLogger.error(`Smarti - closing room failed: No conversation id for room: ${ room._id }`);
		}
	}

}

class SmartiMock extends SmartiAdapter {

	constructor(adapterProps) {
		super(adapterProps);
		this.properties.url = 'http://localhost:8080';
		delete this.headers.authorization;
	}
}

export class SmartiAdapterFactory {

	constructor() {
		this.singleton = undefined;

		/**
		 * Refreshes the adapter instances on change of the configuration
		 */
		//todo: validate it works
		const factory = this;
		RocketChat.settings.onload('Assistify_AI_Source', () => {
			factory.singleton = null;
		});

		RocketChat.settings.onload('Assistify_AI_Smarti_Base_URL', () => {
			factory.singleton = null;
		});

		RocketChat.settings.onload('Assistify_AI_Smarti_Auth_Token', () => {
			factory.singleton = null;
		});

		RocketChat.settings.onload('Assistify_AI_Smarti_Hook_Token', () => {
			factory.singleton = null;
		});
	}

	static getInstance() {
		if (this.singleton) {
			return this.singleton;
		} else {
			const adapterProps = {
				url: '',
				token: '',
				language: ''
			};

			const ROCKET_CHAT_URL = RocketChat.settings.get('Site_Url').replace(/\/?$/, '/');
			adapterProps.url = RocketChat.settings.get('Assistify_AI_Smarti_Base_URL').replace(/\/?$/, '/');
			adapterProps.token = RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token');
			adapterProps.webhookUrl = `${ ROCKET_CHAT_URL }api/v1/smarti.result/${ RocketChat.settings.get('Assistify_AI_Smarti_Hook_Token') }`;
			SystemLogger.debug(RocketChat.settings);

			const useMock = false;
			if (useMock) { //todo: proper mocking
				this.singleton = new SmartiMock(adapterProps);
			} else {
				this.singleton = new SmartiAdapter(adapterProps);
			}
			return this.singleton;
		}
	}
}

/**
 * add method to get conversation id via realtime api
 */
Meteor.methods({
	getLastSmartiResult(rid) {

		//Todo: check if the user is allowed to get this results!

		SystemLogger.debug('Smarti - last smarti result requested:', JSON.stringify(rid, '', 2));
		SystemLogger.debug('Smarti - last message:', JSON.stringify(RocketChat.models.LivechatExternalMessage.findOneById(rid), '', 2));
		return RocketChat.models.LivechatExternalMessage.findOneById(rid);
	}
});

/**
 * add incoming webhook
 */
RocketChat.API.v1.addRoute('smarti.result/:token', {authRequired: false}, {
	post() {

		check(this.bodyParams, Match.ObjectIncluding({
			conversationId: String,
			channelId: String
		}));

		//verify token
		if (this.urlParams.token && this.urlParams.token === RocketChat.settings.get('Assistify_AI_Smarti_Hook_Token')) {

			SystemLogger.debug('Smarti - got conversation result:', JSON.stringify(this.bodyParams, null, 2));
			RocketChat.models.LivechatExternalMessage.update(
				{
					_id: this.bodyParams.channelId
				}, {
					rid: this.bodyParams.channelId,
					knowledgeProvider: 'smarti',
					conversationId: this.bodyParams.conversationId,
					token: this.bodyParams.token,
					ts: new Date()
				}, {
					upsert: true
				});

			const m = RocketChat.models.LivechatExternalMessage.findOneById(this.bodyParams.channelId);
			RocketChat.Notifications.notifyRoom(this.bodyParams.channelId, 'newConversationResult', m);
			return RocketChat.API.v1.success();
		} else {
			return RocketChat.API.v1.unauthorized({msg: 'token not valid'});
		}
	}
});



