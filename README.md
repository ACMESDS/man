/**
@class man
	[SourceForge](https://sourceforge.net) 
	[github](https://github.com/acmesds/jslab) 
	[geointapps](https://git.geointapps.org/acmesds/jslab)
	[gitlab](https://gitlab.west.nga.ic.gov/acmesds/jslab)

MAN provides: matlab-like matrix manipulators, light 
weight image processing, symbolic algebra, dsp, machine learning, regression, expectation-maximization methods, 
neural and bayseian networks, data i/o, task sharding, and special functions.

## Usage

Use the MAN manipulators as follows:

	var $ = require("man");
	
	$( "matlab script", ctx, (ctx) => {   // eval script into context ctx with callback(ctx)
		...
	} );

	$( "matlab script", ctx );   // eval script into context ctx

	var A = $( "matlab expression" );  // eval expression and return resulting matrix
	
	$( N, (n,A) => A[n] = ... );  // define vector A of N elements

	$( [M,N, ... ], (n,m, ... A) => A[m][n] ... = ... );	// define M x N matrrix

	$( {		//  import functions
		somefn: function (args) { ... },
		:
		:
	} );
	
	$.somefn( args );  $( "somefn(args)", ctx );   // use imported function
	
	$( {  		// tasker example
			keys: "i,j,k",  	// e.g. array indecies
			i: [0,1,2,3],  		// domain of index i
			j: [4,8],				// domain of index j
			k: [0],					// domain of index k
			qos: 0,				// regulation time in ms if not zero
			local: false, 		// enable to run task local, i.e. w/o workers and nodes
			workers: 4, 		// limit number of workers (aka cores) per node
			nodes: 3 			// limit number of nodes (ala locales) in the cluster
		}, 

		// here, a simple task that returns a message 
		($) => "my result is " + (i + j*k) + " from " + $.worker + " on "  + $.node,

		// here, a simple callback that displays the task results
		(msg) => console.log(msg) 
	);
	
	evs.$( boolean, (evs) => { ... } );  // thread events evs = [ev, ev, ...] to callback(grouped evs) or callback(null) at end
	
	"query".$( boolean, (evs) => { ... } );	// thread with optional grouping sql queried events to callback(grouped evs)
	
	evs.$( ctx, (evs) => { ... } );		// save aggregated events to context ctx with callback(unsaved events)

## Installation

Clone [MAN manipulator](https://github.com/acmesds/$) into your PROJECT/man folder.  
Clone [ENUM enumerators](https://github.com/acmesds/enum) into your PROJECT/enum folder.  

### Required MySQL databases

* app._stats Read  to derive the default save keys

## Contributing

See our [issues](/issues.view), [milestones](/milestones.view), [s/w requirements](/swreqts.view),
and [h/w requirements](/hwreqts.view).

## License

[MIT](LICENSE)

*/