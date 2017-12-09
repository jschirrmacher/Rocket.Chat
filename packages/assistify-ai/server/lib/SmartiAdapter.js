/* globals SystemLogger, RocketChat */

import { verbs, propagateToSmarti } from '../SmartiProxy';

class SmartiAdapter {

	constructor(adapterProps) {
		this.properties = adapterProps;
	}

	onMessage(message) {

		//TODO is this always a new one, what about update
		const helpRequest = RocketChat.models.HelpRequests.findOneByRoomId(message.rid);
		const supportArea = helpRequest ? helpRequest.supportArea : undefined;
		const requestBody = {
			webhook_url: this.properties.rcWebhookUrl,
			message_id: message._id,
			channel_id: message.rid,
			user_id: message.u._id,
			// username: message.u.username,
			text: message.msg,
			timestamp: message.ts,
			origin: message.origin,
			support_area: supportArea
		};
		const propagate = RocketChat.RateLimiter.limitFunction(
			propagateToSmarti, 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		);
		return propagate(verbs.post, `rocket/${ this.properties.smartiKnowledgeDomain }`, requestBody);
	}

	onClose(room) { //async
		// get conversation id
		const m = RocketChat.models.LivechatExternalMessage.findOneById(room._id);
		if (m) {
			const propagate = RocketChat.RateLimiter.limitFunction(
				propagateToSmarti, 5, 1000, {
					userId(userId) {
						return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
					}
				}
			);
			return propagate(verbs.post, `conversation/${ m.conversationId }/publish`);
		} else {
			SystemLogger.error(`Smarti - closing room failed: No conversation id for room: ${ room._id }`);
		}
	}
}

export class SmartiAdapterFactory {

	/**
	 *  Refreshes the adapter instances on change of the configuration
	 *
	 *  TODO: validate it works
	 */
	constructor() {

		this.singleton = undefined;
		const factory = this;

		RocketChat.settings.get('Assistify_AI_Source', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_Smarti_Base_URL', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_RocketChat_Webhook_Token', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_Smarti_Domain', () => {
			factory.singleton = null;
		});
	}

	static getInstance(reload) {

		if (!this.singleton || reload) {

			const adapterProps = {
				rcUrl: '',
				rcWebhookToken: '',
				rcWebhookUrl: '',
				smartiUrl: '',
				smartiAuthToken: '',
				smartiKnowledgeDomain: ''
			};

			// Rocket.Chat webhook
			adapterProps.rcUrl = RocketChat.settings.get('Site_Url').replace(/\/?$/, '/');
			adapterProps.rcWebhookToken = RocketChat.settings.get('Assistify_AI_RocketChat_Webhook_Token');
			adapterProps.rcWebhookUrl = `${ adapterProps.rcUrl }api/v1/smarti.result/${ adapterProps.rcWebhookToken }`;

			// Smarti connection
			const smartiUrl = RocketChat.settings.get('Assistify_AI_Smarti_Base_URL');
			if (smartiUrl) {
				adapterProps.smartiUrl = smartiUrl.replace(/\/?$/, '/');
			}
			adapterProps.smartiAuthToken = RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token');
			adapterProps.smartiKnowledgeDomain = RocketChat.settings.get('Assistify_AI_Smarti_Domain');

			this.singleton = new SmartiAdapter(adapterProps);
			return this.singleton;
		} else {
			return this.singleton;
		}
	}
}

/**
 * get conversation id via realtime api (used by smarti widget)
 * ddp.method("getLastSmartiResult",[options.channel]);
 */
Meteor.methods({

	getLastSmartiResult(rid) {

		//Todo: check if the user is allowed to get this results!

		SystemLogger.debug('Smarti - last smarti result requested:', JSON.stringify(rid, '', 2));
		SystemLogger.debug('Smarti - last message:', JSON.stringify(RocketChat.models.LivechatExternalMessage.findOneById(rid), '', 2));
		return RocketChat.models.LivechatExternalMessage.findOneById(rid);
	}
});
