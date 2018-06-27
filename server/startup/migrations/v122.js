RocketChat.Migrations.add({
	version: 122,
	up() {
		// Set all the private rooms to 'Secret'
		RocketChat.models.Rooms.update({
			t: 'p',
			secret: {
				$exists: false
			}
		}, {
			$set: {
				secret: true
			}
		}, {
			multi: true
		});
	}
});
