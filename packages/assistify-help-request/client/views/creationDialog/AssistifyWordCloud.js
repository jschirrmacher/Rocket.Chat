import {ReactiveVar} from 'meteor/reactive-var';

const WordCloud= require('meteor/overture8:wordcloud2');

function drawWords() {
	const prepareWordsList = [];
	const words = [];
	const instance = Template.instance();
	instance.data.getWords(words);
	words.forEach(function(word) {
		prepareWordsList.push([word, word.length]);
	});
	const options = {
		clearCanvas: true,
		list: prepareWordsList,
		fontFamily:'Times, serif',
		weightFactor: 3,
		gridsize: 10,
		click(word, dimension, event) {
			instance.data.onSelected(word[0]);
		}
	};
	window.WordCloud(instance.canvasToDraw.get(), options);
}

Template.AssistifyWordCloud.events({
// Future To Do
});

Template.AssistifyWordCloud.helpers({
// Future To Do
});

Template.AssistifyWordCloud.onRendered(function() {
	const canvasToDraw = this.find('[id="draw-words"]');
	if (canvasToDraw) {
		//	this.data.getWords(wordsList);
		this.canvasToDraw.set(canvasToDraw);
		drawWords();
	}
});

Template.AssistifyWordCloud.onCreated(function() {
	this.canvasToDraw = new ReactiveVar('');
});
