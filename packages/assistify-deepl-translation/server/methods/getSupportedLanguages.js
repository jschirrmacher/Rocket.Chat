Meteor.methods({
	getSupportedLanguages(target) {
		return [
			{
				'language': 'EN',
				'name': TAPi18n.__('English', { lng: target })
			},
			{
				'language': 'DE',
				'name': TAPi18n.__('German', { lng: target })
			},
			{
				'language': 'FR',
				'name': TAPi18n.__('French', { lng: target })
			},
			{
				'language': 'ES',
				'name': TAPi18n.__('Spanish', { lng: target })
			},
			{
				'language': 'IT',
				'name': TAPi18n.__('Italian', { lng: target })
			},
			{
				'language': 'NL',
				'name': TAPi18n.__('Dutch', { lng: target })
			},
			{
				'language': 'PL',
				'name': TAPi18n.__('Polish', { lng: target })
			}
		];
	}
});
