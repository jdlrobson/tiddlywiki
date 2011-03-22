//--
//-- TW21Saver (inherits from SaverBase)
//--

function TW21Saver() {}

TW21Saver.prototype = new SaverBase();

TW21Saver.prototype.externalizeTiddler = function(store,tiddler)
{
	try {
		var extendedAttributes = "";
		var usePre = config.options.chkUsePreForStorage;
		store.forEachField(tiddler,
			function(tiddler,fieldName,value) {
				// don't store stuff from the temp namespace
				if(typeof value != "string")
					value = "";
				if(!fieldName.match(/^temp\./))
					extendedAttributes += ' %0="%1"'.format([fieldName,value.escapeLineBreaks().htmlEncode()]);
			},true);
		var created = tiddler.created;
		var modified = tiddler.modified;
		var attributes = tiddler.creator ? ' creator="' + tiddler.creator.htmlEncode() + '"' : "";
		attributes += tiddler.modifier ? ' modifier="' + tiddler.modifier.htmlEncode() + '"' : "";
		attributes += (usePre && created == version.date) ? "" :' created="' + created.convertToYYYYMMDDHHMM() + '"';
		attributes += (usePre && modified == created) ? "" : ' modified="' + modified.convertToYYYYMMDDHHMM() +'"';
		var tags = tiddler.getTags();
		if(!usePre || tags)
			attributes += ' tags="' + tags.htmlEncode() + '"';
		var tagArea = [], linksArea = [];
		var className = [];
		var links = tiddler.getLinks()
		for(var i = 0; i < tags.length; i++) {
				if(store.tiddlerExists(tags[i])) {
					tagArea.push('<a class="tiddlyLink" href="#[[%0]]">%0</a>'.format(tags[i]));
				}
				if(tags[i] === "excludeLists") {
					className.push("excludeLists");
				}
		}
		for(var i = 0; i < links.length; i++) {
			if(store.tiddlerExists(links[i])) {
				linksArea.push('<a class="tiddlyLink" href="#[[%0]]">%0</a>'.format(links[i]));
			}
		}
		return ('<div %0="%1"%2%3 class="%7"><a name="[[%1]]" href="#[[%1]]"><h2>%1</h2></a>%4<div class="tagged">tags: %5</div><div class="linksArea">links: %6</div></'+'div>').format([
				usePre ? "title" : "tiddler",
				tiddler.title.htmlEncode(),
				attributes,
				extendedAttributes,
				usePre ? "\n<pre>" + tiddler.text.htmlEncode() + "</pre>\n" : tiddler.text.escapeLineBreaks().htmlEncode(),
				tagArea.join(""), linksArea.join(""),
				className.join("")
			]);
	} catch (ex) {
		throw exceptionText(ex,config.messages.tiddlerSaveError.format([tiddler.title]));
	}
};

