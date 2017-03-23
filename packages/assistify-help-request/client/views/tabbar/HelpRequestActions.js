Template.HelpRequestActions.helpers({
	helprequestOpen() {
		const instance = Template.instance();
		return instance.data.resolutionStatus && instance.data.resolutionStatus != 'resolved'; //undefined in livechats
	},

	isLivechat() {
		return ChatSubscription.findOne({rid: Session.get('openedRoom')}).t === 'l';
	},

	livechatOpen() {
		const room = ChatRoom.findOne({ _id: Session.get('openedRoom')});
		return room.open;
	},
});

Template.HelpRequestActions.dialogs = {
	ClosingDialog: class {
		/**
		 * @param room the room to get the values from
		 * @param properties (optional) SweetAlert options
		 */
		constructor(helpRequest, properties) {
			this.room = ChatRoom.findOne(helpRequest.roomId);
			this.properties = _.isObject(properties) ? properties : {};
		}

		/**
		 * @return Promise (keep in mind that native es6-promises aren't cancelable. So always provide a then & catch)
		 */
		display() {
			var self = this;
			return new Promise(function (resolve, reject) {
				swal.withForm(_.extend({
					title: t('Closing_chat'),
					text: '',
					formFields: [{
						id: 'comment',
						value: self.room.comment,
						type: 'input',
						label: t("comment"),
						placeholder: t('Please_add_a_comment')
					}, {
						id: 'tags',
						value: self.room.tags ? self.room.tags.join(", ") : "",
						type: 'input',
						placeholder: t('Please_add_a_tag')
					}, {
						id: 'knowledgeProviderUsage',
						type: 'select',
						options: [
							{value: 'Unknown', text: t("knowledge_provider_usage_unknown")},
							{value: 'Perfect', text: t("knowledge_provider_usage_perfect")},
							{value: 'Helpful', text: t("knowledge_provider_usage_helpful")},
							{value: 'NotUsed', text: t("knowledge_provider_usage_not_used")},
							{value: 'Useless', text: t("knowledge_provider_usage_useless")}
						]
					}],
					showCancelButton: true,
					closeOnConfirm: false
				}, self.properties), function (isConfirm) {
					if (!isConfirm) { //on cancel
						$('.swal-form').remove(); //possible bug? why I have to do this manually
						reject();
						return false;
					}
					let form = this.swalForm;
					for (let key in form) {
						if (!form.hasOwnProperty(key)) {
							continue;
						}
					}
					resolve(form);
				});
			}).then((r) => {
				$('.sa-input-error').show();
				return r;
			}).catch((reason) => {
				throw reason
			});
		}
	}
};

Template.HelpRequestActions.events({
	'click .close-helprequest': function (event, instance) {
		event.preventDefault();

		swal(_.extend({
			title: t('Closing_chat'),
			type: 'input',
			inputPlaceholder: t('Please_add_a_comment'),
			showCancelButton: true,
			closeOnConfirm: false,
			roomId: instance.data.roomId
		}), (inputValue) => {
			if (!inputValue) {
				swal.showInputError(t('Please_add_a_comment_to_close_the_room'));
				return false;
			}

			if (s.trim(inputValue) === '') {
				swal.showInputError(t('Please_add_a_comment_to_close_the_room'));
				return false;
			}

			Meteor.call('assistify:closeHelpRequest', this.roomId, {comment: inputValue}, function(error) {
				if (error) {
					return handleError(error);
				} else {
					swal({
						title: t('Chat_closed'),
						text: t('Chat_closed_successfully'),
						type: 'success',
						timer: 1000,
						showConfirmButton: false
					});

					instance.helpRequest.set(
						RocketChat.models.HelpRequests.findOneByRoomId(Template.currentData())
					);
				}
			});
		});
	},
	'click .close-livechat': function (event, instance) {
		event.preventDefault();

		swal({
			title: t('Closing_chat'),
			type: 'input',
			inputPlaceholder: t('Please_add_a_comment'),
			showCancelButton: true,
			closeOnConfirm: false
		}, (inputValue) => {
			if (!inputValue) {
				swal.showInputError(t('Please_add_a_comment_to_close_the_room'));
				return false;
			}

			if (s.trim(inputValue) === '') {
				swal.showInputError(t('Please_add_a_comment_to_close_the_room'));
				return false;
			}

			Meteor.call('livechat:closeRoom', this.rid, inputValue, function(error/*, result*/) {
				if (error) {
					return handleError(error);
				}
				swal({
					title: t('Chat_closed'),
					text: t('Chat_closed_successfully'),
					type: 'success',
					timer: 1000,
					showConfirmButton: false
				});
			});
		});
	}
});

Template.HelpRequestActions.onCreated( function() {
	this.helpRequest = new ReactiveVar(null);

	this.autorun(() => {
		if (Template.currentData().roomId && this.helpRequest.get()) {
			// const helpRequest = RocketChat.models.HelpRequests.findOneByRoomId(instance.roomId);
			// instance.helpRequest.set(helpRequest);

			if(!instance.helpRequest.get()){ //todo remove after PoC: Non-reactive method call
				Meteor.call('assistify:helpRequestByRoomId', Template.currentData().roomId,(err, result) => {
					if(!err){
						instance.helpRequest.set(result);
					} else {
						console.log(err);
					}
				});
			}
		}
	});
});
