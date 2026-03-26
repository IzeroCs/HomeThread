module.exports = {
  extends: ["stylelint-config-standard-scss"],
  ignoreFiles: ["**/dist/**", "**/node_modules/**"],
  rules: {
    indentation: 2,
    "declaration-block-trailing-semicolon": "always",
  },
};
