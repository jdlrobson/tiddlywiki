jQuery(document).ready(function(){

	module("TW21Loader");

	test("loading tests", function() {
		var loader = new TW21Loader();
		var node = $("#storeArea [title='testTiddler2']")[0];
		var title = "dummy";
		var tiddler = new Tiddler(title);
		var out_tiddler = loader.internalizeTiddler(store,tiddler,title,node);
		console.log(out_tiddler.text);
		strictEqual(out_tiddler.text.indexOf("\n\n"), 0, "tiddler text should retain the leading 2 new lines");
	});
});
