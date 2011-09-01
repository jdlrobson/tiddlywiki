var tiddlywebsaver = function($, tiddler) {
	/***
	|''Name''|ServerSideSavingPlugin|
	|''Description''|server-side saving|
	|''Author''|FND|
	|''Version''|0.6.5|
	|''Status''|stable|
	|''Source''|http://svn.tiddlywiki.org/Trunk/association/plugins/ServerSideSavingPlugin.js|
	|''License''|[[BSD|http://www.opensource.org/licenses/bsd-license.php]]|
	|''CoreVersion''|2.5.3|
	|''Keywords''|serverSide|
	!Notes
	This plugin relies on a dedicated adaptor to be present.
	The specific nature of this plugin depends on the respective server.
	!Revision History
	!!v0.1 (2008-11-24)
	* initial release
	!!v0.2 (2008-12-01)
	* added support for local saving
	!!v0.3 (2008-12-03)
	* added Save to Web macro for manual synchronization
	!!v0.4 (2009-01-15)
	* removed ServerConfig dependency by detecting server type from the respective tiddlers
	!!v0.5 (2009-08-25)
	* raised CoreVersion to 2.5.3 to take advantage of core fixes
	!!v0.6 (2010-04-21)
	* added notification about cross-domain restrictions to ImportTiddlers
	!To Do
	* conflict detection/resolution
	* rename to ServerLinkPlugin?
	* document deletion/renaming convention
	!Code
	***/
	//{{{
	(function($) {

	readOnly = false; //# enable editing over HTTP

	var plugin = config.extensions.ServerSideSavingPlugin = {};

	plugin.locale = {
		saved: "%0 saved successfully",
		saveError: "Error saving %0: %1",
		saveConflict: "Error saving %0: edit conflict",
		deleted: "Removed %0",
		deleteError: "Error removing %0: %1",
		deleteLocalError: "Error removing %0 locally",
		removedNotice: "This tiddler has been deleted.",
		connectionError: "connection could not be established",
		hostError: "Unable to import from this location due to cross-domain restrictions."
	};

	plugin.sync = function(tiddlers) {
		tiddlers = tiddlers && tiddlers[0] ? tiddlers : store.getTiddlers();
		$.each(tiddlers, function(i, tiddler) {
			var changecount = parseInt(tiddler.fields.changecount, 10);
			if(tiddler.fields.deleted === "true" && changecount === 1) {
				plugin.removeTiddler(tiddler);
			} else if(tiddler.isTouched() && !tiddler.doNotSave() &&
					tiddler.getServerType() && tiddler.fields["server.host"]) { // XXX: server.host could be empty string
				delete tiddler.fields.deleted;
				plugin.saveTiddler(tiddler);
			}
		});
	};

	plugin.saveTiddler = function(tiddler) {
		try {
			var adaptor = this.getTiddlerServerAdaptor(tiddler);
		} catch(ex) {
			return false;
		}
		var context = {
			tiddler: tiddler,
			changecount: tiddler.fields.changecount,
			workspace: tiddler.fields["server.workspace"]
		};
		var serverTitle = tiddler.fields["server.title"]; // indicates renames
		if(!serverTitle) {
			tiddler.fields["server.title"] = tiddler.title;
		} else if(tiddler.title != serverTitle) {
			return adaptor.moveTiddler({ title: serverTitle },
				{ title: tiddler.title }, context, null, this.saveTiddlerCallback);
		}
		var req = adaptor.putTiddler(tiddler, context, {}, this.saveTiddlerCallback);
		return req ? tiddler : false;
	};

	plugin.saveTiddlerCallback = function(context, userParams) {
		var tiddler = context.tiddler;
		if(context.status) {
			if(tiddler.fields.changecount == context.changecount) { //# check for changes since save was triggered
				tiddler.clearChangeCount();
			} else if(tiddler.fields.changecount > 0) {
				tiddler.fields.changecount -= context.changecount;
			}
			plugin.reportSuccess("saved", tiddler);
			store.setDirty(false);
		} else {
			if(context.httpStatus == 412) {
				plugin.reportFailure("saveConflict", tiddler);
			} else {
				plugin.reportFailure("saveError", tiddler, context);
			}
		}
	};

	plugin.removeTiddler = function(tiddler) {
		try {
			var adaptor = this.getTiddlerServerAdaptor(tiddler);
		} catch(ex) {
			return false;
		}
		var context = {
			host: tiddler.fields["server.host"],
			workspace: tiddler.fields["server.workspace"],
			tiddler: tiddler
		};
		var req = adaptor.deleteTiddler(tiddler, context, {}, this.removeTiddlerCallback);
		return req ? tiddler : false;
	};

	plugin.removeTiddlerCallback = function(context, userParams) {
		var tiddler = context.tiddler;
		if(context.status) {
			if(tiddler.fields.deleted === "true") {
				store.deleteTiddler(tiddler.title);
			} else {
				plugin.reportFailure("deleteLocalError", tiddler);
			}
			plugin.reportSuccess("deleted", tiddler);
			store.setDirty(false);
		} else {
			plugin.reportFailure("deleteError", tiddler, context);
		}
	};

	plugin.getTiddlerServerAdaptor = function(tiddler) { // XXX: rename?
		var type = tiddler.fields["server.type"] || config.defaultCustomFields["server.type"];
		return new config.adaptors[type]();
	};

	plugin.reportSuccess = function(msg, tiddler) {
		displayMessage(plugin.locale[msg].format([tiddler.title]));
	};

	plugin.reportFailure = function(msg, tiddler, context) {
		var desc = (context && context.httpStatus) ? context.statusText :
			plugin.locale.connectionError;
		displayMessage(plugin.locale[msg].format([tiddler.title, desc]));
	};

	config.macros.saveToWeb = { // XXX: hijack existing sync macro?
		locale: { // TODO: merge with plugin.locale?
			btnLabel: "save to web",
			btnTooltip: "synchronize changes",
			btnAccessKey: null
		},

		handler: function(place, macroName, params, wikifier, paramString, tiddler) {
			createTiddlyButton(place, this.locale.btnLabel, this.locale.btnTooltip,
				plugin.sync, null, null, this.locale.btnAccessKey);
		}
	};

	// hijack saveChanges to trigger remote saving
	var _saveChanges = saveChanges;
	saveChanges = function(onlyIfDirty, tiddlers) {
		if(window.location.protocol == "file:") {
			_saveChanges.apply(this, arguments);
		} else {
			plugin.sync(tiddlers);
		}
	};

	// override removeTiddler to flag tiddler as deleted -- XXX: use hijack to preserve compatibility?
	TiddlyWiki.prototype.removeTiddler = function(title) { // XXX: should override deleteTiddler instance method?
		var tiddler = this.fetchTiddler(title);
		if(tiddler) {
			tiddler.tags = ["excludeLists", "excludeSearch", "excludeMissing"];
			tiddler.text = plugin.locale.removedNotice;
			tiddler.fields.deleted = "true"; // XXX: rename to removed/tiddlerRemoved?
			tiddler.fields.changecount = "1";
			this.notify(title, true);
			this.setDirty(true);
		}
	};

	// hijack ImportTiddlers wizard to handle cross-domain restrictions
	var _onOpen = config.macros.importTiddlers.onOpen;
	config.macros.importTiddlers.onOpen = function(ev) {
		var btn = $(resolveTarget(ev));
		var url = btn.closest(".wizard").find("input[name=txtPath]").val();
		if(window.location.protocol != "file:" && url.indexOf("://") != -1) {
			var host = url.split("/")[2];
			var macro = config.macros.importTiddlers;
			if(host != window.location.host) {
				btn.text(macro.cancelLabel).attr("title", macro.cancelPrompt);
				btn[0].onclick = macro.onCancel;
				$('<span class="status" />').text(plugin.locale.hostError).insertAfter(btn);
				return false;
			}
		}
		return _onOpen.apply(this, arguments);
	};

	})(jQuery);
	//}}}
	/***
	|''Name''|TiddlyWebAdaptor|
	|''Description''|adaptor for interacting with TiddlyWeb|
	|''Author:''|FND|
	|''Contributors''|Chris Dent, Martin Budden|
	|''Version''|1.4.10|
	|''Status''|stable|
	|''Source''|http://svn.tiddlywiki.org/Trunk/association/adaptors/TiddlyWebAdaptor.js|
	|''CodeRepository''|http://svn.tiddlywiki.org/Trunk/association/|
	|''License''|[[BSD|http://www.opensource.org/licenses/bsd-license.php]]|
	|''CoreVersion''|2.5|
	|''Keywords''|serverSide TiddlyWeb|
	!Notes
	This plugin includes [[jQuery JSON|http://code.google.com/p/jquery-json/]].
	!To Do
	* createWorkspace
	* document custom/optional context attributes (e.g. filters, query, revision) and tiddler fields (e.g. server.title, origin)
	!Code
	***/
	//{{{
	(function($) {

	var adaptor = config.adaptors.tiddlyweb = function() {};

	adaptor.prototype = new AdaptorBase();
	adaptor.serverType = "tiddlyweb";
	adaptor.serverLabel = "TiddlyWeb";
	adaptor.mimeType = "application/json";

	adaptor.parsingErrorMessage = "Error parsing result from server";
	adaptor.noBagErrorMessage = "no bag specified for tiddler";
	adaptor.locationIDErrorMessage = "no bag or recipe specified for tiddler"; // TODO: rename

	// retrieve current status (requires TiddlyWeb status plugin)
	adaptor.prototype.getStatus = function(context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		var uriTemplate = "%0/status";
		var uri = uriTemplate.format([context.host]);
		var req = httpReq("GET", uri, adaptor.getStatusCallback, context,
			null, null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.getStatusCallback = function(status, context, responseText, uri, xhr) {
		context.status = responseText ? status : false;
		try {
			context.statusText = xhr.statusText;
		} catch(exc) { // offline (Firefox)
			context.status = false;
			context.statusText = null;
		}
		context.httpStatus = xhr.status;
		if(context.status) {
			context.serverStatus = $.evalJSON(responseText); // XXX: error handling!?
		}
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// retrieve a list of workspaces
	adaptor.prototype.getWorkspaceList = function(context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.workspaces = [];
		var uriTemplate = "%0/recipes"; // XXX: bags?
		var uri = uriTemplate.format([context.host]);
		var req = httpReq("GET", uri, adaptor.getWorkspaceListCallback,
			context, { accept: adaptor.mimeType }, null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.getWorkspaceListCallback = function(status, context, responseText, uri, xhr) {
		context.status = status;
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(status) {
			try {
				var workspaces = $.evalJSON(responseText);
			} catch(ex) {
				context.status = false; // XXX: correct?
				context.statusText = exceptionText(ex, adaptor.parsingErrorMessage);
				if(context.callback) {
					context.callback(context, context.userParams);
				}
				return;
			}
			context.workspaces = workspaces.map(function(itm) { return { title: itm }; });
		}
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// retrieve a list of tiddlers
	adaptor.prototype.getTiddlerList = function(context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		var uriTemplate = "%0/%1/%2/tiddlers%3";
		var params = context.filters ? "?" + context.filters : "";
		if(context.format) {
			params = context.format + params;
		}
		var workspace = adaptor.resolveWorkspace(context.workspace);
		var uri = uriTemplate.format([context.host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name), params]);
		var req = httpReq("GET", uri, adaptor.getTiddlerListCallback,
			context, merge({ accept: adaptor.mimeType }, context.headers), null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.getTiddlerListCallback = function(status, context, responseText, uri, xhr) {
		context.status = status;
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(status) {
			context.tiddlers = [];
			try {
				var tiddlers = $.evalJSON(responseText); //# NB: not actual tiddler instances
			} catch(ex) {
				context.status = false; // XXX: correct?
				context.statusText = exceptionText(ex, adaptor.parsingErrorMessage);
				if(context.callback) {
					context.callback(context, context.userParams);
				}
				return;
			}
			for(var i = 0; i < tiddlers.length; i++) {
				var tiddler = adaptor.toTiddler(tiddlers[i], context.host);
				context.tiddlers.push(tiddler);
			}
		}
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// perform global search
	adaptor.prototype.getSearchResults = function(context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		var uriTemplate = "%0/search?q=%1%2";
		var filterString = context.filters ? ";" + context.filters : "";
		var uri = uriTemplate.format([context.host, context.query, filterString]); // XXX: parameters need escaping?
		var req = httpReq("GET", uri, adaptor.getSearchResultsCallback,
			context, { accept: adaptor.mimeType }, null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.getSearchResultsCallback = function(status, context, responseText, uri, xhr) {
		adaptor.getTiddlerListCallback(status, context, responseText, uri, xhr); // XXX: use apply?
	};

	// retrieve a particular tiddler's revisions
	adaptor.prototype.getTiddlerRevisionList = function(title, limit, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		var uriTemplate = "%0/%1/%2/tiddlers/%3/revisions";
		var workspace = adaptor.resolveWorkspace(context.workspace);
		var uri = uriTemplate.format([context.host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name), adaptor.normalizeTitle(title)]);
		var req = httpReq("GET", uri, adaptor.getTiddlerRevisionListCallback,
			context, merge({ accept: adaptor.mimeType }, context.headers), null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.getTiddlerRevisionListCallback = function(status, context, responseText, uri, xhr) {
		context.status = status;
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(status) {
			context.revisions = [];
			try {
				var tiddlers = $.evalJSON(responseText); //# NB: not actual tiddler instances
			} catch(ex) {
				context.status = false; // XXX: correct?
				context.statusText = exceptionText(ex, adaptor.parsingErrorMessage);
				if(context.callback) {
					context.callback(context, context.userParams);
				}
				return;
			}
			for(var i = 0; i < tiddlers.length; i++) {
				var tiddler = adaptor.toTiddler(tiddlers[i], context.host);
				context.revisions.push(tiddler);
			}
			var sortField = "server.page.revision";
			context.revisions.sort(function(a, b) {
				return a.fields[sortField] < b.fields[sortField] ? 1 :
					(a.fields[sortField] == b.fields[sortField] ? 0 : -1);
			});
		}
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// retrieve an individual tiddler revision -- XXX: breaks with standard arguments list -- XXX: convenience function; simply use getTiddler?
	adaptor.prototype.getTiddlerRevision = function(title, revision, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.revision = revision;
		return this.getTiddler(title, context, userParams, callback);
	};

	// retrieve an individual tiddler
	//# context is an object with members host and workspace
	//# callback is passed the new context and userParams
	adaptor.prototype.getTiddler = function(title, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.title = title;
		if(context.revision) {
			var uriTemplate = "%0/%1/%2/tiddlers/%3/revisions/%4";
		} else {
			uriTemplate = "%0/%1/%2/tiddlers/%3";
		}
		if(!context.tiddler) {
			context.tiddler = new Tiddler(title);
		}
		context.tiddler.fields["server.type"] = adaptor.serverType;
		context.tiddler.fields["server.host"] = AdaptorBase.minHostName(context.host);
		context.tiddler.fields["server.workspace"] = context.workspace;
		var workspace = adaptor.resolveWorkspace(context.workspace);
		var uri = uriTemplate.format([context.host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name), adaptor.normalizeTitle(title),
			context.revision]);
		var req = httpReq("GET", uri, adaptor.getTiddlerCallback, context,
			merge({ accept: adaptor.mimeType }, context.headers), null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.getTiddlerCallback = function(status, context, responseText, uri, xhr) {
		context.status = status;
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(status) {
			try {
				var tid = $.evalJSON(responseText);
			} catch(ex) {
				context.status = false;
				context.statusText = exceptionText(ex, adaptor.parsingErrorMessage);
				if(context.callback) {
					context.callback(context, context.userParams);
				}
				return;
			}
			var tiddler = adaptor.toTiddler(tid, context.host);
			tiddler.title = context.tiddler.title;
			tiddler.fields["server.etag"] = xhr.getResponseHeader("Etag");
			// normally we'd assign context.tiddler = tiddler here - but we can't do
			// that because of IE, which triggers getTiddler in putTiddlerCallback,
			// and since ServerSideSavingPlugin foolishly relies on persistent
			// object references, we need to merge the data into the existing object
			$.extend(context.tiddler, tiddler);
		}
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// retrieve tiddler chronicle (all revisions)
	adaptor.prototype.getTiddlerChronicle = function(title, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.title = title;
		var uriTemplate = "%0/%1/%2/tiddlers/%3/revisions?fat=1";
		var workspace = adaptor.resolveWorkspace(context.workspace);
		var uri = uriTemplate.format([context.host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name), adaptor.normalizeTitle(title)]);
		var req = httpReq("GET", uri, adaptor.getTiddlerChronicleCallback,
			context, { accept: adaptor.mimeType }, null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.getTiddlerChronicleCallback = function(status, context, responseText, uri, xhr) {
		context.status = status;
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(status) {
			context.responseText = responseText;
		}
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// store an individual tiddler
	adaptor.prototype.putTiddler = function(tiddler, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.title = tiddler.title;
		context.tiddler = tiddler;
		context.host = context.host || this.fullHostName(tiddler.fields["server.host"]);
		var uriTemplate = "%0/%1/%2/tiddlers/%3";
		try {
			context.workspace = context.workspace || tiddler.fields["server.workspace"];
			var workspace = adaptor.resolveWorkspace(context.workspace);
		} catch(ex) {
			return adaptor.locationIDErrorMessage;
		}
		var uri = uriTemplate.format([context.host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name),
			adaptor.normalizeTitle(tiddler.title)]);
		var etag = adaptor.generateETag(workspace, tiddler);
		var headers = etag ? { "If-Match": etag } : null;
		var payload = {
			type: tiddler.fields["server.content-type"] || null,
			text: tiddler.text,
			tags: tiddler.tags,
			fields: $.extend({}, tiddler.fields)
		};
		delete payload.fields.changecount;
		$.each(payload.fields, function(key, value) {
			if(key.indexOf("server.") == 0) {
				delete payload.fields[key];
			}
		});
		payload = $.toJSON(payload);
		var req = httpReq("PUT", uri, adaptor.putTiddlerCallback,
			context, headers, payload, adaptor.mimeType, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.putTiddlerCallback = function(status, context, responseText, uri, xhr) {
		context.status = [204, 1223].contains(xhr.status);
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(context.status) {
			var loc = xhr.getResponseHeader("Location");
			var etag = xhr.getResponseHeader("Etag");
			if(loc && etag) {
				var bag = loc.split("/bags/").pop().split("/")[0];
				context.tiddler.fields["server.bag"] = bag;
				context.tiddler.fields["server.workspace"] = "bags/" + bag;
				var rev = etag.split("/").pop().split(/;|:/)[0];
				context.tiddler.fields["server.page.revision"] = rev;
				context.tiddler.fields["server.etag"] = etag;
				if(context.callback) {
					context.callback(context, context.userParams);
				}
			} else { // IE
				context.adaptor.getTiddler(context.tiddler.title, context,
					context.userParams, context.callback);
			}
		} else if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// store a tiddler chronicle
	adaptor.prototype.putTiddlerChronicle = function(revisions, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.title = revisions[0].title;
		var headers = null;
		var uriTemplate = "%0/%1/%2/tiddlers/%3/revisions";
		var host = context.host || this.fullHostName(tiddler.fields["server.host"]);
		var workspace = adaptor.resolveWorkspace(context.workspace);
		var uri = uriTemplate.format([host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name),
			adaptor.normalizeTitle(context.title)]);
		if(workspace.type == "bag") { // generate ETag
			var etag = [adaptor.normalizeTitle(workspace.name),
				adaptor.normalizeTitle(context.title), 0].join("/"); //# zero-revision prevents overwriting existing contents
			headers = { "If-Match": '"' + etag + '"' };
		}
		var payload = $.toJSON(revisions);
		var req = httpReq("POST", uri, adaptor.putTiddlerChronicleCallback,
			context, headers, payload, adaptor.mimeType, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.putTiddlerChronicleCallback = function(status, context, responseText, uri, xhr) {
		context.status = [204, 1223].contains(xhr.status);
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// store a collection of tiddlers (import TiddlyWiki HTML store)
	adaptor.prototype.putTiddlerStore = function(store, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		var uriTemplate = "%0/%1/%2/tiddlers";
		var host = context.host;
		var workspace = adaptor.resolveWorkspace(context.workspace);
		var uri = uriTemplate.format([host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name)]);
		var req = httpReq("POST", uri, adaptor.putTiddlerStoreCallback,
			context, null, store, "text/x-tiddlywiki", null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.putTiddlerStoreCallback = function(status, context, responseText, uri, xhr) {
		context.status = [204, 1223].contains(xhr.status);
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// rename an individual tiddler or move it to a different workspace -- TODO: make {from|to}.title optional
	//# from and to are objects with members title and workspace (bag; optional),
	//# representing source and target tiddler, respectively
	adaptor.prototype.moveTiddler = function(from, to, context, userParams, callback) { // XXX: rename parameters (old/new)?
		var self = this;
		var newTiddler = store.getTiddler(from.title) || store.getTiddler(to.title); //# local rename might already have occurred
		var oldTiddler = $.extend(true, {}, newTiddler); //# required for eventual deletion
		oldTiddler.title = from.title; //# required for original tiddler's ETag
		var _getTiddlerChronicle = function(title, context, userParams, callback) {
			return self.getTiddlerChronicle(title, context, userParams, callback);
		};
		var _putTiddlerChronicle = function(context, userParams) {
			if(!context.status) {
				return callback(context, userParams);
			}
			var revisions = $.evalJSON(context.responseText); // XXX: error handling?
			// change current title while retaining previous location
			for(var i = 0; i < revisions.length; i++) {
				delete revisions[i].revision;
				if(!revisions[i].fields.origin) { // NB: origin = "<workspace>/<title>"
					revisions[i].fields.origin = ["bags", revisions[i].bag, revisions[i].title].join("/");
				}
				revisions[i].title = to.title;
			}
			// add new revision
			var rev = $.extend({}, revisions[0]);
			$.each(newTiddler, function(i, item) {
				if(!$.isFunction(item)) {
					rev[i] = item;
				}
			});
			rev.title = to.title;
			rev.created = rev.created.convertToYYYYMMDDHHMM();
			rev.modified = new Date().convertToYYYYMMDDHHMM();
			delete rev.fields.changecount;
			revisions.unshift(rev);
			if(to.workspace) {
				context.workspace = to.workspace;
			} else if(context.workspace.substring(0, 4) != "bags") { // NB: target workspace must be a bag
				context.workspace = "bags/" + rev.bag;
			}
			var subCallback = function(context, userParams) {
				if(!context.status) {
					return callback(context, userParams);
				}
				context.adaptor.getTiddler(newTiddler.title, context, userParams, _deleteTiddler);
			};
			return self.putTiddlerChronicle(revisions, context, context.userParams, subCallback);
		};
		var _deleteTiddler = function(context, userParams) {
			if(!context.status) {
				return callback(context, userParams);
			}
			$.extend(true, newTiddler, context.tiddler);
			context.callback = null;
			return self.deleteTiddler(oldTiddler, context, context.userParams, callback);
		};
		callback = callback || function() {};
		context = this.setContext(context, userParams);
		context.host = context.host || oldTiddler.fields["server.host"];
		context.workspace = from.workspace || oldTiddler.fields["server.workspace"];
		return _getTiddlerChronicle(from.title, context, userParams, _putTiddlerChronicle);
	};

	// delete an individual tiddler
	adaptor.prototype.deleteTiddler = function(tiddler, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.title = tiddler.title; // XXX: not required!?
		var uriTemplate = "%0/bags/%1/tiddlers/%2";
		var host = context.host || this.fullHostName(tiddler.fields["server.host"]);
		var bag = tiddler.fields["server.bag"];
		if(!bag) {
			return adaptor.noBagErrorMessage;
		}
		var uri = uriTemplate.format([host, adaptor.normalizeTitle(bag),
			adaptor.normalizeTitle(tiddler.title)]);
		var etag = adaptor.generateETag({ type: "bag", name: bag }, tiddler);
		var headers = etag ? { "If-Match": etag } : null;
		var req = httpReq("DELETE", uri, adaptor.deleteTiddlerCallback, context, headers,
			null, null, null, null, true);
		return typeof req == "string" ? req : true;
	};

	adaptor.deleteTiddlerCallback = function(status, context, responseText, uri, xhr) {
		context.status = [204, 1223].contains(xhr.status);
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// compare two revisions of a tiddler (requires TiddlyWeb differ plugin)
	//# if context.rev1 is not specified, the latest revision will be used for comparison
	//# if context.rev2 is not specified, the local revision will be sent for comparison
	//# context.format is a string as determined by the TiddlyWeb differ plugin
	adaptor.prototype.getTiddlerDiff = function(title, context, userParams, callback) {
		context = this.setContext(context, userParams, callback);
		context.title = title;

		var tiddler = store.getTiddler(title);
		try {
			var workspace = adaptor.resolveWorkspace(tiddler.fields["server.workspace"]);
		} catch(ex) {
			return adaptor.locationIDErrorMessage;
		}
		var tiddlerRef = [workspace.type + "s", workspace.name, tiddler.title].join("/");

		var rev1 = context.rev1 ? [tiddlerRef, context.rev1].join("/") : tiddlerRef;
		var rev2 = context.rev2 ? [tiddlerRef, context.rev2].join("/") : null;

		var uriTemplate = "%0/diff?rev1=%1";
		if(rev2) {
			uriTemplate += "&rev2=%2";
		}
		if(context.format) {
			uriTemplate += "&format=%3";
		}
		var host = context.host || this.fullHostName(tiddler.fields["server.host"]);
		var uri = uriTemplate.format([host, adaptor.normalizeTitle(rev1),
			adaptor.normalizeTitle(rev2), context.format]);

		if(rev2) {
			var req = httpReq("GET", uri, adaptor.getTiddlerDiffCallback, context, null,
				null, null, null, null, true);
		} else {
			var payload = {
				title: tiddler.title,
				text: tiddler.text,
				modifier: tiddler.modifier,
				tags: tiddler.tags,
				fields: $.extend({}, tiddler.fields)
			}; // XXX: missing attributes!?
			payload = $.toJSON(payload);
			req = httpReq("POST", uri, adaptor.getTiddlerDiffCallback, context,
				null, payload, adaptor.mimeType, null, null, true);
		}
		return typeof req == "string" ? req : true;
	};

	adaptor.getTiddlerDiffCallback = function(status, context, responseText, uri, xhr) {
		context.status = status;
		context.statusText = xhr.statusText;
		context.httpStatus = xhr.status;
		context.uri = uri;
		if(status) {
			context.diff = responseText;
		}
		if(context.callback) {
			context.callback(context, context.userParams);
		}
	};

	// generate tiddler information
	adaptor.prototype.generateTiddlerInfo = function(tiddler) {
		var info = {};
		var uriTemplate = "%0/%1/%2/tiddlers/%3";
		var host = this.host || tiddler.fields["server.host"]; // XXX: this.host obsolete?
		host = this.fullHostName(host);
		var workspace = adaptor.resolveWorkspace(tiddler.fields["server.workspace"]);
		info.uri = uriTemplate.format([host, workspace.type + "s",
			adaptor.normalizeTitle(workspace.name),
			adaptor.normalizeTitle(tiddler.title)]);
		return info;
	};

	// create Tiddler instance from TiddlyWeb tiddler JSON
	adaptor.toTiddler = function(json, host) {
		var created = Date.convertFromYYYYMMDDHHMM(json.created);
		var modified = Date.convertFromYYYYMMDDHHMM(json.modified);
		var fields = json.fields;
		fields["server.type"] = adaptor.serverType;
		fields["server.host"] = AdaptorBase.minHostName(host);
		fields["server.bag"] = json.bag;
		fields["server.title"] = json.title;
		if(json.recipe) {
			fields["server.recipe"] = json.recipe;
		}
		if(json.type && json.type != "None") {
			fields["server.content-type"] = json.type;
		}
		fields["server.permissions"] = json.permissions.join(", ");
		fields["server.page.revision"] = json.revision;
		fields["server.workspace"] = "bags/" + json.bag;
		var tiddler = new Tiddler(json.title);
		tiddler.assign(tiddler.title, json.text, json.modifier, modified, json.tags,
			created, json.fields, json.creator);
		return tiddler;
	};

	adaptor.resolveWorkspace = function(workspace) {
		var components = workspace.split("/");
		return {
			type: components[0] == "bags" ? "bag" : "recipe",
			name: components[1] || components[0]
		};
	};

	adaptor.generateETag = function(workspace, tiddler) {
		var revision = tiddler.fields["server.page.revision"];
		var etag = revision == "false" ? null : tiddler.fields["server.etag"];
		if(!etag && workspace.type == "bag") {
			if(typeof revision == "undefined") {
				revision = "0";
			} else if(revision == "false") {
				return null;
			}
			etag = [adaptor.normalizeTitle(workspace.name),
				adaptor.normalizeTitle(tiddler.title), revision].join("/");
			etag = '"' + etag + '"';
		}
		return etag;
	};

	adaptor.normalizeTitle = function(title) {
		return encodeURIComponent(title);
	};

	})(jQuery);


	/*
	 * jQuery JSON Plugin
	 * version: 1.3
	 * source: http://code.google.com/p/jquery-json/
	 * license: MIT (http://www.opensource.org/licenses/mit-license.php)
	 */
	(function($){function toIntegersAtLease(n)
	{return n<10?'0'+n:n;}
	Date.prototype.toJSON=function(date)
	{return this.getUTCFullYear()+'-'+
	toIntegersAtLease(this.getUTCMonth())+'-'+
	toIntegersAtLease(this.getUTCDate());};var escapeable=/["\\\x00-\x1f\x7f-\x9f]/g;var meta={'\b':'\\b','\t':'\\t','\n':'\\n','\f':'\\f','\r':'\\r','"':'\\"','\\':'\\\\'};$.quoteString=function(string)
	{if(escapeable.test(string))
	{return'"'+string.replace(escapeable,function(a)
	{var c=meta[a];if(typeof c==='string'){return c;}
	c=a.charCodeAt();return'\\u00'+Math.floor(c/16).toString(16)+(c%16).toString(16);})+'"';}
	return'"'+string+'"';};$.toJSON=function(o,compact)
	{var type=typeof(o);if(type=="undefined")
	return"undefined";else if(type=="number"||type=="boolean")
	return o+"";else if(o===null)
	return"null";if(type=="string")
	{return $.quoteString(o);}
	if(type=="object"&&typeof o.toJSON=="function")
	return o.toJSON(compact);if(type!="function"&&typeof(o.length)=="number")
	{var ret=[];for(var i=0;i<o.length;i++){ret.push($.toJSON(o[i],compact));}
	if(compact)
	return"["+ret.join(",")+"]";else
	return"["+ret.join(", ")+"]";}
	if(type=="function"){throw new TypeError("Unable to convert object of type 'function' to json.");}
	var ret=[];for(var k in o){var name;type=typeof(k);if(type=="number")
	name='"'+k+'"';else if(type=="string")
	name=$.quoteString(k);else
	continue;var val=$.toJSON(o[k],compact);if(typeof(val)!="string"){continue;}
	if(compact)
	ret.push(name+":"+val);else
	ret.push(name+": "+val);}
	return"{"+ret.join(", ")+"}";};$.compactJSON=function(o)
	{return $.toJSON(o,true);};$.evalJSON=function(src)
	{return eval("("+src+")");};$.secureEvalJSON=function(src)
	{var filtered=src;filtered=filtered.replace(/\\["\\\/bfnrtu]/g,'@');filtered=filtered.replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,']');filtered=filtered.replace(/(?:^|:|,)(?:\s*\[)+/g,'');if(/^[\],:{}\s]*$/.test(filtered))
	return eval("("+src+")");else
	throw new SyntaxError("Error parsing JSON, source is not valid.");};})(jQuery);
	//}}}
	/***
	|''Name''|TiddlyWebConfig|
	|''Description''|configuration settings for TiddlyWebWiki|
	|''Author''|FND|
	|''Version''|1.3.2|
	|''Status''|stable|
	|''Source''|http://svn.tiddlywiki.org/Trunk/association/plugins/TiddlyWebConfig.js|
	|''License''|[[BSD|http://www.opensource.org/licenses/bsd-license.php]]|
	|''Requires''|TiddlyWebAdaptor ServerSideSavingPlugin|
	|''Keywords''|serverSide TiddlyWeb|
	!Code
	***/
	//{{{
	(function($) {

	if(!config.extensions.ServerSideSavingPlugin) {
		throw "Missing dependency: ServerSideSavingPlugin";
	}
	if(!config.adaptors.tiddlyweb) {
		throw "Missing dependency: TiddlyWebAdaptor";
	}

	if(window.location.protocol != "file:") {
		config.options.chkAutoSave = true;
	}

	var adaptor = tiddler.getAdaptor();
	var recipe = tiddler.fields["server.recipe"];
	var workspace = recipe ? "recipes/" + recipe : "bags/common";

	var plugin = config.extensions.tiddlyweb = {
		host: tiddler.fields["server.host"].replace(/\/$/, ""),
		username: null,
		status: {},

		getStatus: null, // assigned later
		getUserInfo: function(callback) {
			this.getStatus(function(status) {
				callback({
					name: plugin.username,
					anon: plugin.username ? plugin.username == "GUEST" : true
				});
			});
		},
		hasPermission: function(type, tiddler) {
			var perms = tiddler.fields["server.permissions"];
			if(perms) {
				return perms.split(", ").contains(type);
			} else {
				return true;
			}
		}
	};

	config.defaultCustomFields = {
		"server.type": tiddler.getServerType(),
		"server.host": plugin.host,
		"server.workspace": workspace
	};

	// modify toolbar commands

	config.shadowTiddlers.ToolbarCommands = config.shadowTiddlers.ToolbarCommands.
		replace("syncing ", "revisions syncing ");

	config.commands.saveTiddler.isEnabled = function(tiddler) {
		return plugin.hasPermission("write", tiddler) && !tiddler.isReadOnly();
	};

	config.commands.deleteTiddler.isEnabled = function(tiddler) {
		return !readOnly && plugin.hasPermission("delete", tiddler);
	};

	// hijack option macro to disable username editing
	var _optionMacro = config.macros.option.handler;
	config.macros.option.handler = function(place, macroName, params, wikifier,
			paramString) {
		if(params[0] == "txtUserName") {
			params[0] = "options." + params[0];
			var self = this;
			var args = arguments;
			args[0] = $("<span />").appendTo(place)[0];
			plugin.getUserInfo(function(user) {
				config.macros.message.handler.apply(self, args);
			});
		} else {
			_optionMacro.apply(this, arguments);
		}
	};

	// hijack isReadOnly to take into account permissions and content type
	var _isReadOnly = Tiddler.prototype.isReadOnly;
	Tiddler.prototype.isReadOnly = function() {
		return _isReadOnly.apply(this, arguments) ||
			!plugin.hasPermission("write", this);
	};

	var getStatus = function(callback) {
		if(plugin.status.version) {
			callback(plugin.status);
		} else {
			var self = getStatus;
			if(self.pending) {
				if(callback) {
					self.queue.push(callback);
				}
			} else {
				self.pending = true;
				self.queue = callback ? [callback] : [];
				var _callback = function(context, userParams) {
					var status = context.serverStatus || {};
					for(var key in status) {
						if(key == "username") {
							plugin.username = status[key];
							config.macros.option.propagateOption("txtUserName",
								"value", plugin.username, "input");
						} else {
							plugin.status[key] = status[key];
						}
					}
					for(var i = 0; i < self.queue.length; i++) {
						self.queue[i](plugin.status);
					}
					delete self.queue;
					delete self.pending;
				};
				adaptor.getStatus({ host: plugin.host }, null, _callback);
			}
		}
	};
	(plugin.getStatus = getStatus)(); // XXX: hacky (arcane combo of assignment plus execution)

	})(jQuery);
	//}}}
};
tiddlywiki.ready(function() {
	var tiddler = new Tiddler("tiddlyweb");
	merge(tiddler.fields, { "server.host": $("#tiddlywebconfig .host").text(),
		"server.type": "tiddlyweb", "server.workspace": $("#tiddlywebconfig .workspace").text() });
	tiddlywebsaver(jQuery, tiddler);
});
