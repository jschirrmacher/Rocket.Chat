const setIfNotChanged = function(_id, value, callback) {
	const setting = RocketChat.models.Settings.findOneById(_id);

	if (setting.valueSource === 'packageValue' && setting.value !== value) {

	} //packages/rocketchat-lib/server/functions/settings.js
};

Meteor.startup(() => {

});
