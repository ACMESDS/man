/**
@class man
	[SourceForge](https://sourceforge.net) 
	[github](https://github.com/acmesds/jslab) 
	[geointapps](https://git.geointapps.org/acmesds/jslab)
	[gitlab](https://gitlab.west.nga.ic.gov/acmesds/jslab)

The manipualtor MAN provides: 
[matlab-like matrix manipulators](https://www.npmjs.com/package/mathjs), 
[light weight image processing](https://www.npmjs.com/package/lwip), 
[symbolic algebra](https://www.npmjs.com/package/mathjs), 
[digital signal processing](https://www.npmjs.com/package/dsp) and [fft](https://www.npmjs.com/package/fft-js), 
[hidden markov, viterbi, baum-welch](https://www.npmjs.com/package/nodehmm) 
aka [expectation-maximization](https://www.npmjs.com/package/expectation-maximization) algorithms,
[eigen spectrums](https://www.npmjs.com/package/node-svd),
[recurrent](https://www.npmjs.com/package/recurrent-js),
[bayesian belief](https://www.npmjs.com/package/jsbayes), and
[convolutional](http://caffe.berkeleyvision.org/) neural networks,
[logistic](https://www.npmjs.com/package/newton-raphson-method) and
[support vector machine](https://www.npmjs.com/package/node-svm) regressions,
[least cost path](https://www.npmjs.com/package/edmonds-blossom),
[linear programming](https://www.npmjs.com/package/javascript-lp-solver),
and [other machine learning](https://www.npmjs.com/package/ml) optimizers,
special ([gamma](npm gamma), 
[multivariate normal](https://www.npmjs.com/package/multivariate-normal), 
[rieman-zeta](https://www.npmjs.com/package/math-riemann-zeta) functions,
[task sharding](https://github.com/ACMESDS/totem),
and a data i/o interface.

## Usage

Use MAN as follows:

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

Clone [MAN manipulator](https://github.com/acmesds/man) into your PROJECT/man folder.  
Clone [ENUM enumerators](https://github.com/acmesds/enum) into your PROJECT/enum folder.  

### Required MySQL databases

* app._stats Read  to derive the default save keys

## Contributing

To contribute to this module, see our [issues](https://totem.west.ile.nga.ic.gov/issues.view)
and [milestones](https://totem.west.ile.nga.ic.gov/milestones.view).

## License

[MIT](LICENSE)

*/