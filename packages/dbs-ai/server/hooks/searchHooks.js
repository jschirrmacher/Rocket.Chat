/* global SystemLogger */
function onSpotlighStartHandler(item) {
	SystemLogger.debug('onSpotlightStart', item.text);
}

function onSpotlighEndHandler(item) {
	SystemLogger.debug('onSpotlightEnd', item.text);
	if (item.result && item.result.rooms) {
		const subscripedChannels = RocketChat.models.Subscriptions.findByUserId(Meteor.userId()).fetch().map((subscription) => { return subscription._room; });
		const publicChannelsNotContaingUser = RocketChat.models.Rooms.findAllPublicNotContainingUserName(Meteor.user().username).fetch();
		const accessibleRooms = subscripedChannels.concat(publicChannelsNotContaingUser);
		const conversations = Meteor.call('searchConversations', item.text, accessibleRooms);

		console.log('Room:', JSON.stringify(accessibleRooms));

		// TODO check the result if all rooms are accessible?
		item.result.rooms = item.result.rooms.concat(conversations);
	}
}

// RocketChat Callback register
RocketChat.callbacks.add('onSpotlightStart', onSpotlighStartHandler, RocketChat.callbacks.priority.LOW, 'assistify.onSpotlightStart');
RocketChat.callbacks.add('onSpotlightEnd', onSpotlighEndHandler, RocketChat.callbacks.priority.LOW, 'assistify.onSpotlightEnd');
