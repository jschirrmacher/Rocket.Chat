/* globals */
/**
 * Created by OliverJaegle on 01.08.2016.
 */
// var _ = Npm.require('underscore');

_.extend(RocketChat.models.LivechatExternalMessage, {
	findOneById(_id, options) {
		const query = { _id };
		return this.findOne(query, options);
	},
	findOneByConversationId(convId, options) {
		const query = { 'conversationId': convId };
		return this.findOne(query, options);
	},
	clear() {
		const ids = this.find({}, { _id: 1 }).map(function(item) {
			return item._id;
		});
		const query = { _id: { $in: ids } };
		return this.remove(query);
	}
});
