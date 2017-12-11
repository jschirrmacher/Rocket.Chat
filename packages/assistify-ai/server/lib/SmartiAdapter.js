/* globals SystemLogger, RocketChat */

import {SmartiProxyFactory, verbs} from '../SmartiProxy';

/**
 * The SmartiAdapter handles the interaction with Smarti triggered by Rocket.Chat hooks (not by Smarti widget).
 */
class SmartiAdapter {

	/**
	 * Instantiates the Smarti adapter with options.
	 *
	 * @param {object} options: {
	 *      smartiKnowledgeDomain: STRING,
	 *      rocketWebhookUrl: STRING
	 * }
	 */
	constructor(options) {

		this.properties = options;
		this.smartiProxy = SmartiProxyFactory.getInstance();
	}

	/**
	 * Event implementation that posts the message to Smarti.
	 *
	 * @param {object} message: {
	 *   _id: STRING,
	 *   rid: STRING,
	 *   u: {*},
	 *   msg: STRING,
	 *   ts: NUMBER,
	 *   origin: STRING
	 * }
	 *
	 * @returns {*}
	 */
	onMessage(message) {

		//TODO is this always a new one, what about update
		const helpRequest = RocketChat.models.HelpRequests.findOneByRoomId(message.rid);
		const supportArea = helpRequest ? helpRequest.supportArea : undefined;
		const requestBody = {
			// TODO: Should this really be in the responsibility of the Adapter?
			webhook_url: this.properties.rocketWebhookUrl,
			message_id: message._id,
			channel_id: message.rid,
			user_id: message.u._id,
			// username: message.u.username,
			text: message.msg,
			timestamp: message.ts,
			origin: message.origin,
			support_area: supportArea
		};
		return RocketChat.RateLimiter.limitFunction(
			this.smartiProxy.propagateToSmarti.bind(this.smartiProxy), 5, 1000, {
				userId(userId) {
					return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
				}
			}
		)(verbs.post, `rocket/${ this.properties.smartiKnowledgeDomain }`, requestBody);
	}

	/**
	 * Event implementation that publishes the conversation in Smarti.
	 *
	 * @param room - the room to close
	 *
	 * @returns {*}
	 */
	onClose(room) { //async

		// get conversation id
		const m = RocketChat.models.LivechatExternalMessage.findOneById(room._id);
		if (m) {
			return RocketChat.RateLimiter.limitFunction(
				this.smartiProxy.propagateToSmarti.bind(this.smartiProxy), 5, 1000, {
					userId(userId) {
						return !RocketChat.authz.hasPermission(userId, 'send-many-messages');
					}
				}
			)(verbs.post, `conversation/${ m.conversationId }/publish`);
		} else {
			SystemLogger.error(`Smarti - closing room failed: No conversation id for room: ${ room._id }`);
		}
	}
}

/**
 * Factory to create a Smarti adapter singleton.
 */
export class SmartiAdapterFactory {

	/**
	 *  Refreshes the adapter instances on change of the configuration
	 *  TODO: validate it works
	 */
	constructor() {

		this.singleton = undefined;
		const factory = this;

		RocketChat.settings.get('Assistify_AI_Smarti_Domain', () => {
			factory.singleton = null;
		});
	}

	/**
	 * Returns the SmartiAdapter singleton
	 *
	 * @returns {SmartiAdapter}
	 */
	static getInstance() {

		if (!this.singleton) {

			const knowledgeDomain = RocketChat.settings.get('Assistify_AI_Smarti_Domain');
			let rocketUrl = RocketChat.settings.get('Site_Url');
			rocketUrl = rocketUrl ? rocketUrl.replace(/\/?$/, '/') : rocketUrl;
			const rocketWebhookToken = RocketChat.settings.get('Assistify_AI_RocketChat_Webhook_Token');
			const rcWebhookUrl = `${ rocketUrl }api/v1/smarti.result/${ rocketWebhookToken }`;
			const options = {
				smartiKnowledgeDomain: knowledgeDomain,
				rocketWebhookUrl: rcWebhookUrl
			};
			this.singleton = new SmartiAdapter(options);
		}
		return this.singleton;
	}
}
