export default {
  // Single package mode
  // packageName: "react",
  // version: "18.2.0",

  // Multi-package mode
  packages: {
    "react": "18.2.0",
    "react-dom": "18.2.0",
  },

  paths: [
    "./example/app1",
    "./example/app2",
    "./example/legacy-app",
  ],
  exact: false,
};
