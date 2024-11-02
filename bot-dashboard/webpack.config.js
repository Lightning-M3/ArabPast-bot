module.exports = {
  // ... الإعدادات الأخرى
  module: {
    rules: [
      {
        test: /\.js$/,
        enforce: 'pre',
        use: ['source-map-loader'],
        exclude: [
          /node_modules\/stylis-plugin-rtl/
        ]
      }
    ]
  },
  ignoreWarnings: [/Failed to parse source map/]
}; 