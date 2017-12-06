Meteor.startup(() => {
	if (!RocketChat.settings.get('language')) {
		RocketChat.settings.set('language', 'de');
	}
});
