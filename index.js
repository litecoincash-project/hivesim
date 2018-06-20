var bigInt = require('big-integer');
var crypto = require('crypto');

var NUM_BLOCKS = 30;							// Num blocks to simulate in a chunk
var MAX_TARGET = bigInt("0fffffffffffffffffffffffffffffff", 16);	// Max (easiest) target. CBigNum maxBeeHashTarget(~uint256(0) >> 16);
var BEE_MATURATION_BLOCKS = 576;					// Blocks for a bee to mature
var BEE_LIFESPAN_BLOCKS = 576*7;					// Blocks a bee lives for after maturing
var EMA_WINDOW_SIZE = 30;
var EMA_SPACING_TARGET = 2;
var BEE_ADD_CHANCE = 0.05;
var BEE_ADD_QUANT = 10;

var blocks = new Array();
var bees = new Array();
var chainHeight = 0;
var hiveMinedBlocks = 0;
var totalBeesSpawned = 0;

// Calculate beeHashTarget for the current block
function GetNextBeeHashTarget(height) {	
	var numPowBlocks = 0;
	var j = height-1;
	
	// Count num pow blocks since last hive block
	for (; j > 0 && !blocks[j].isHiveMined; j--)
		numPowBlocks++;
	
	// Start of blockchain? Return min difficulty target
	if (j <= 0)
		return MAX_TARGET;
	
	// TODO: Fix this; ALL blocks, including pow, currently calc and store a bee hash target.
	// This would mean blocks need to carry an extra nBits field for bee hash target.
	// To avoid changing block structure and serialisation, it would be preferable for pow
	// blocks to track pow difficulty and only hive blocks track hive difficulty.
	if (numPowBlocks == 0)
		return blocks[height-1].beeHashTarget;
	
	// Get previous target
	var beeHashTarget = blocks[height-1].beeHashTarget;

	// Apply EMA
	var emaWindowSize = EMA_WINDOW_SIZE;
	var emaDesiredSpacing = EMA_SPACING_TARGET;
	var interval = emaWindowSize / emaDesiredSpacing;
	beeHashTarget = beeHashTarget.multiply(bigInt((interval - 1) * emaDesiredSpacing + numPowBlocks + numPowBlocks));
	beeHashTarget = beeHashTarget.divide(bigInt((interval + 1) * emaDesiredSpacing));
	
	// Clamp to min difficulty
	if (beeHashTarget.compare(MAX_TARGET) > 0)
		beeHashTarget = MAX_TARGET;

	return beeHashTarget;
}

// Return number of bees which can solve current block (simulated)
function AttemptHiveSolve(target,height) {
	// Cull dead bees
	bees = bees.filter(a => !a.deleteMe);
	
	// Find our best bee hash
	var solvers = 0;
	for (var i=0; i<bees.length; i++) {
		// Mark old bees for culling
		if (height > bees[i].born_at + BEE_MATURATION_BLOCKS + BEE_LIFESPAN_BLOCKS) {
			bees[i].deleteMe = true;
			continue;
		}
		
		// Skip immature bees
		if (height - bees[i].born_at < BEE_MATURATION_BLOCKS)
			continue;
		
		// Find beeHash. For simulation purposes this is just random bytes, which is equivalent to real hash distribution!
		var hexStr = crypto.randomBytes(16).toString('hex');
		var beeHash = bigInt(hexStr,16);
		if (beeHash.compare(target) < 0)
			solvers++;
	}
	return solvers;
}

// Simulate next NUM_BLOCKS of blockchain
function Simulate(chartCallback, numBlocks, maxTarget, beeMatBlocks, beeLifeSpanBlocks, emaWindowSize, emaSpacingTarget, beeAddChance, beeAddQuant) {
	NUM_BLOCKS = parseInt(numBlocks);
	MAX_TARGET = bigInt(maxTarget,16);
	BEE_MATURATION_BLOCKS = parseInt(beeMatBlocks);
	BEE_LIFESPAN_BLOCKS = parseInt(beeLifeSpanBlocks);
	EMA_WINDOW_SIZE = parseInt(emaWindowSize);
	EMA_SPACING_TARGET = parseInt(emaSpacingTarget);
	BEE_ADD_CHANCE = parseFloat(beeAddChance);
	BEE_ADD_QUANT = parseInt(beeAddQuant);
	
	var result = "Block\tBees\tBlock type\tbeeHashTarget (difficulty)\n----------------------------------------------------------------------\n";
	
	// Simulate next NUM_BLOCKS of the blockchain
	for (var i=0; i<NUM_BLOCKS; i++) {
		// Try to hive mine the block
		var beeHashTarget = GetNextBeeHashTarget(chainHeight);		
		var solvers = 0;
		if (chainHeight > 0 && !blocks[chainHeight-1].isHiveMined)	// Don't hive mine after a hive block
			solvers = AttemptHiveSolve(beeHashTarget, chainHeight);
		if (solvers > 0)
			hiveMinedBlocks++;
		
		// Store relevant block fields
		blocks[chainHeight] = {
			beeHashTarget: beeHashTarget,
			isHiveMined: (solvers > 0)
		};
		
		// Add some bees
		if(Math.random() < BEE_ADD_CHANCE)
			AddBees(Math.round(Math.random() * BEE_ADD_QUANT));
		
		// Log
		var difficulty = MAX_TARGET.divide(blocks[chainHeight].beeHashTarget);		
		chartCallback(chainHeight, difficulty, bees.length, solvers > 1 ? solvers -1 : 0);
		result += blocks[chainHeight].isHiveMined ? "<font color='orange'>" : "<font color='green'>";
		result += chainHeight + "\t" + bees.length + "\t";
		result += blocks[chainHeight].isHiveMined ? "Hive: " + solvers + " bees" : "PoW\t";
		result += "\t" + Pad32(blocks[chainHeight].beeHashTarget.toString(16)) + " (" + difficulty + ")</font>\n";
		
		chainHeight++;
	}
		
	// Dump results
	var blocksPerBee = hiveMinedBlocks / totalBeesSpawned;
	var hiveMinedBlocksPerCent = hiveMinedBlocks / chainHeight * 100;
	result += "\nTotal bees spawned: " + totalBeesSpawned + " Hive mined blocks: " + hiveMinedBlocks + " (" + hiveMinedBlocksPerCent.toFixed(2) + "% of all blocks)\nAverage blocks found per bee: " + blocksPerBee.toFixed(4);
	document.getElementById("results").innerHTML = "<pre>"+result+"</pre>";
}

// Pad with leading zeroes up to 32 chars
function Pad32(str) {
	while(str.length < 32)
		str = "0"+str;
	return str;
}

// Reset the blockchain and bee pop
function Reset() {
	blocks = new Array();
	bees = new Array();
	chainHeight = 0;
	hiveMinedBlocks = 0;
	totalBeesSpawned = 0;
	document.getElementById("results").innerHTML = "";
}

// Add given number of bees
function AddBees(beesToAdd) {
	beesToAdd = parseInt(beesToAdd);
	for (var i=0; i<beesToAdd; i++) {
		var bee = {
			born_at: chainHeight,
			deleteMe: false
		};
		bees.push(bee);
	}
	totalBeesSpawned += beesToAdd;
}

module.exports = {
	Simulate,
	Reset,
	AddBees
}
