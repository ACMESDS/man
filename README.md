/**
@class man
	[SourceForge](https://sourceforge.net) 
	[github](https://github.com/acmesds/jslab) 
	[geointapps](https://git.geointapps.org/acmesds/jslab)
	[gitlab](https://gitlab.west.nga.ic.gov/acmesds/jslab)

The matrix manipulator MAN provides: 
[matlab-like matrix manipulators](https://www.npmjs.com/package/mathjs), 
[light weight image processing](https://www.npmjs.com/package/jimp), 
[symbolic algebra](https://www.npmjs.com/package/mathjs), 
[digital signal](https://www.npmjs.com/package/dsp) and [spectral](https://www.npmjs.com/package/fft-js) processing, 
hidden markov ([viterbi, baum-welch](https://www.npmjs.com/package/nodehmm) and
[EM](https://www.npmjs.com/package/expectation-maximization) algorithms),
[eigen spectrums](https://www.npmjs.com/package/node-svd),
[recurrent](https://www.npmjs.com/package/recurrent-js),
[bayesian belief](https://www.npmjs.com/package/jsbayes) and
[convolutional](http://caffe.berkeleyvision.org/) neural networks,
[logistic](https://www.npmjs.com/package/ml-logistic-regression) and
[support vector machine](https://www.npmjs.com/package/node-svm) regressions,
various ([least cost path](https://www.npmjs.com/package/edmonds-blossom),
[linear programming](https://www.npmjs.com/package/javascript-lp-solver),
[gradient descent, newton-raphton](https://www.npmjs.com/package/newton-raphson-method) 
and [other machine learning](https://www.npmjs.com/package/ml)) non-linear optimizers,
several special functions ([gamma](https://www.npmjs.com/package/gamma), 
[multivariate normal](https://www.npmjs.com/package/multivariate-normal), 
[rieman-zeta](https://www.npmjs.com/package/math-riemann-zeta)),
[task sharding](https://github.com/ACMESDS/totem),
and a data i/o interface.

## Usage

Use MAN as follows:

	var $ = require("man");
	
	Eval mathjs script in a mathjs || js context ctx (if ctx.mathjs: true || false) with callback:
	
		$( "mathjs script", ctx, ctx => {   
			...
		} );

	or w/o callback:

		var ctx = $( "mathjs script", ctx );
		const {x, y, ... } = $( "mathjs script", ctx );

	Create and index a matrix:
	
		var 
			A = $( N, (n,A) => A[n] = ... ),  // define N-length vector A 
			B = $( [M,N], (n,m,B) => B[m][n] = ... ),	// define M x N matrrix
			C = A.$( B ); 	// index matrix A with matrix B
			A.$( (n,C) => C[n] = ... ), 	// index matrix A with callback

	Import functions to $.somefn and to $( "somefn(...)" )
	
		$( {
			somefn: function (args) { ... },
			:
			:
		} );
	
	Execute tasker sharder (an example):
	
			$( { 
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
			$ => "my result is " + (i + j*k) + " from " + $.worker + " on "  + $.node,

			// here, a simple callback that displays the task results
			msg => console.log(msg) 
		);
	
	Group events by key to callback cb( events ) with cb( null ) at end:
	
		[ev, ...].feed( key, (evs) => { ... } ); 
		"query".feed( key, (evs) => { ... } );	
	
	Aggregate and save events ev = {at: "KEY", ...} to ctx.Save_KEY with callback cb(unsaved events)

		[ev, ...].save( ctx, (evs) => { ... } );
		"query".save( ctx, (evs) => { ... } );

## Installation

Clone [MAN manipulator](https://github.com/acmesds/man) into your PROJECT/man folder.  
Clone [ENUM enumerators](https://github.com/acmesds/enum) into your PROJECT/enum folder.  

### Required MySQL databases

* app._stats Read  to derive the default save keys

### Manage 

	npm run [ edit || start ]			# Configure environment
	npm test [ ? || L1 || ... ]					# unit test
	npm run [ prmprep || prmload ]		# Revise PRM
	
## Contributing

To contribute to this module, see our [issues](https://totem.west.ile.nga.ic.gov/issues.view)
and [milestones](https://totem.west.ile.nga.ic.gov/milestones.view).

## License

[MIT](LICENSE)

*/