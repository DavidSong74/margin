const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Monorepo root (two levels up from artifacts/margin)
const monorepoRoot = path.resolve(__dirname, "../..");

const config = getDefaultConfig(__dirname);

// Allow Metro to watch and serve ALL files under the monorepo root.
// This is required for pnpm workspaces: node_modules symlinks in artifacts/margin
// point to the root node_modules/.pnpm/ store, which lives OUTSIDE the workspace.
// Adding the monorepo root makes Metro's URL base the monorepo root itself,
// so bundle URLs like "node_modules/.pnpm/expo-router.../entry.bundle" resolve correctly.
config.watchFolders = [
  ...(config.watchFolders || []),
  monorepoRoot,
];

// Tell the resolver to look in both the workspace and monorepo root
config.resolver.nodeModulesPaths = [
  path.join(__dirname, "node_modules"),
  path.join(monorepoRoot, "node_modules"),
];

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // expo-camera uses native-only APIs that crash on web. Redirect it to a stub.
  if (platform === "web" && moduleName === "expo-camera") {
    return {
      filePath: path.resolve(__dirname, "lib/expo-camera.web.ts"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
