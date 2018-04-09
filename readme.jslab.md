/**
@class JSLAB
	[SourceForge](https://sourceforge.net) 
	[github](https://github.com/acmesds/jslab.git) 
	[geointapps](https://git.geointapps.org/acmesds/jslab)
	[gitlab](https://gitlab.west.nga.ic.gov/acmesds/jslab.git)

JSLAB provides the LWIP (light weight image processing), JSON, TASK (task sharding), 
GET, and 
ME (matlab emulator) modules for [DEBE-compliant plugins](/api.view).

## Using

Configure following the [ENUM deep copy() conventions](https://github.com/acmesds/enum):

	var JSLAB = require("jslab").config({
		key: value, 						// set key
		"key.key": value, 					// indexed set
		"key.key.": value					// indexed append
	}, function (err) {
		console.log( err ? "something evil is lurking" : "look mom - Im running!");
	});

where its [key:value options](/shares/prm/jslab/index.html) override the defaults.

## Installing

Clone from one of the repos into your PROJECT/jslab, then:

	cd PROJECT/jslab
	ln -s PROJECT/totem/test.js test.js 			# unit testing
	ln -s PROJECT/totem/maint.sh maint.sh 		# test startup and maint scripts

Dependencies:
* [ENUM basic enumerators](https://github.com/acmesds/enum)

## Contributing

See our [issues](/issues.view), [milestones](/milestones.view), [s/w requirements](/swreqts.view),
and [h/w requirements](/hwreqts.view).

## License

[MIT](LICENSE)

*/