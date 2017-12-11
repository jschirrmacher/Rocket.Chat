/* globals SystemLogger, RocketChat */

/** The HTTP methods. */
export const verbs = {
	get: 'GET',
	post: 'POST',
	put: 'PUT',
	delete: 'DELETE'
};

/**
 * The proxy propagates the HTTP requests to Smarti.
 * All HTTP outbound traffic (from Rocket.Chat to Smarti) should pass the this proxy.
 */
class SmartiProxy {

	/**
	 * Instantiates the SmartiProxy with the given properties.
	 *
	 * @param {Object} adapterProps
	 * @param {String} adapterProps.smartiUrl
	 * @param {String} adapterProps.smartiAuthToken
	 */
	constructor(adapterProps) {

		this.properties = adapterProps;
	}

	/**
	 * Propagates requests to Smarti.
	 * Make sure all requests to Smarti are using this function.
	 *
	 * @param {String} method - the HTTP method to use
	 * @param {String} path - the path to call
	 * @param {String} body - the payload to pass (optional)
	 *
	 * @returns {Object}
	 */
	propagateToSmarti(method, path, body) {

		const header = {
			'X-Auth-Token': this.properties.smartiAuthToken,
			'Content-Type': 'application/json; charset=utf-8'
		};
		try {
			const response = HTTP.call(method, `${ this.properties.smartiUrl }${ path }`, {data: body, headers: header});
			let result = response.data;
			if (!result) {
				result = response;
			}
			return RocketChat.API.v1.success(result);
		} catch (error) {
			SystemLogger.error('Could not complete', method, 'to', URL);
			SystemLogger.debug(error);
			return RocketChat.API.v1.failure(error);
		}
	}
}

/**
 * The factory to create a SmartiProxy singleton.
 */
export class SmartiProxyFactory {

	/**
	 *  Refreshes the proxy instances on change of the configuration.
	 *  TODO: validate it works
	 */
	constructor() {

		this.singleton = undefined;
		const factory = this;

		RocketChat.settings.get('Assistify_AI_Smarti_Base_URL', () => {
			factory.singleton = null;
		});
		RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token', () => {
			factory.singleton = null;
		});
	}

	/**
	 * Returns the SmartiProxy singleton.
	 *
	 * @returns {SmartiProxy}
	 */
	static getInstance() {

		if (!this.singleton) {

			const adapterProps = {
				smartiUrl: '',
				smartiAuthToken: ''
			};

			// Smarti connection
			const smartiUrl = RocketChat.settings.get('Assistify_AI_Smarti_Base_URL');
			if (smartiUrl) {
				adapterProps.smartiUrl = smartiUrl.replace(/\/?$/, '/');
			}
			adapterProps.smartiAuthToken = RocketChat.settings.get('Assistify_AI_Smarti_Auth_Token');

			this.singleton = new SmartiProxy(adapterProps);
		}
		return this.singleton;
	}
}
