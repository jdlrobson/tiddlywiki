/***
Shadow tiddlers used by TiddlyWeb
***/
config.shadowTiddlers.StyleSheetDiffFormatter = ["!StyleSheet",
".diff { white-space: pre; font-family: monospace; }",
".diff ins, .diff del { display: block; text-decoration: none; }",
".diff ins { background-color: #dfd; }",
".diff del { background-color: #fdd; }",
".diff .highlight { background-color: [[ColorPalette::SecondaryPale]]; }"].join("\n");
store.addNotification("StyleSheetDiffFormatter", refreshStyles);
var NOP = function() {};
window.backstage = { init: NOP, isPanelVisible: NOP };
