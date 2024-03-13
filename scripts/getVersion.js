#!/usr/bin/env node

/**
 * Gets the version from the package.json file in the specified directory.
 * This script exits with non-zero status if the version is not found.
 * 
 * Usage: node getVersion.js <directory>
 */

// Check if a directory was provided
const directory = process.argv[2]
if (!directory) {
  console.error('Please provide a directory')
  process.exit(1)
}


const { version } = require(`../${directory}/package.json`)
if (!version) {
  console.error('No version found in package.json')
  process.exit(1)
}

// Echo it to the console
console.log(version)
