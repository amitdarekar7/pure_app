const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo root (two levels up from apps/mobile)
const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so Metro can resolve hoisted packages
config.watchFolders = [workspaceRoot];

// Search for node_modules in the local dir first, then the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure the hoisted expo-router entry resolves without a ../../ prefix
// by adding the workspace root as an extra node_modules location
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
