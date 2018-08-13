import { SystemLogger } from 'meteor/rocketchat:logger';

Meteor.methods({
	'assistify.translate'(httpMethod, url, params, data) {
		try {
			const result = HTTP.call(httpMethod, url, params, data);
			if (result.statusCode === 200 && result.data && result.data.translation && result.data.translation.length > 0) {
				return decodeURIComponent(result.data.translation);
			}
		} catch (e) {
			SystemLogger.error('Error translating message attachment', e);
		}
	}
});
