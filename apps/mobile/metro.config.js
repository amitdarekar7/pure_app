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

// Expo web can request a relative entry module path in monorepos.
// Remap it to the package entry so hoisted node_modules resolve correctly.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './node_modules/expo-router/entry') {
    return context.resolveRequest(context, 'expo-router/entry', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.disableHierarchicalLookup = false;

module.exports = config;
