const path = require('path');
const webpack = require('webpack');
const cssNano = require('cssnano');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  devtool: 'source-map',

  entry: {
    vendor: ['bluebird', 'moment', 'lodash', 'angular', 'd3', 'c3'],
    app: path.resolve(__dirname, 'client/app/app.js'),
  },

  output: {
    path: path.resolve(__dirname, 'public/build'),
    filename: 'js/[name].[chunkhash].js',
  },

  optimization: {
    minimizer: [
      new TerserPlugin({
        sourceMap: true,
      }),
    ],
    splitChunks: {
      cacheGroups: {
        vendor: {
          chunks: 'initial',
          test: 'vendor',
          name: 'vendor',
          enforce: true,
        },
      },
    },
  },

  plugins: [
    // new BundleAnalyzerPlugin(),
    new CleanWebpackPlugin(),
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    new webpack.LoaderOptionsPlugin({
      minimize: true,
      debug: false,
    }),
    new webpack.NoEmitOnErrorsPlugin(),
    new OptimizeCssAssetsPlugin({
      assetNameRegExp: /\.css$/g,
      cssProcessor: cssNano,
      cssProcessorOptions: { discardComments: { removeAll: true } },
      canPrint: true,
    }),
    new ExtractTextPlugin({
      filename: 'css/[name].[chunkhash].css',
      disable: false,
      allChunks: true,
    }),
  ],

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: {
          test: path.resolve(__dirname, 'node_modules'),
          exclude: path.resolve(__dirname, 'node_modules/icc'),
        },
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env'],
              plugins: [
                '@babel/plugin-transform-runtime',
                ['angularjs-annotate', { explicitOnly: false }],
              ],
            },
          },
        ],
      },
      {
        test: /\.html$/,
        loader: 'raw-loader',
      },
      {
        test: /\.(jade|pug)$/,
        use: [
          'raw-loader',
          'pug-html-loader',
        ],
      },
      {
        test: /\.scss$/,
        loader: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: [
            {
              loader: 'css-loader',
              options: {
                sourceMap: true,
                importLoaders: 1,
              },
            },
            {
              loader: 'postcss-loader',
              options: {
                sourceMap: true,
                plugins: () => [
                  require('autoprefixer')(),
                ],
              },
            },
            {
              loader: 'sass-loader',
              options: {
                sourceMap: true,
              },
            },
          ],
          publicPath: '../',
        }),
      },
      {
        test: /\.css$/,
        loader: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: [
            {
              loader: 'css-loader',
              options: {
                sourceMap: true,
                importLoaders: 1,
              },
            },
            {
              loader: 'postcss-loader',
              options: {
                sourceMap: true,
                plugins: () => [
                  require('autoprefixer')(),
                ],
              },
            },
          ],
          publicPath: '../',
        }),
      },
      {
        test: /\.(woff(2)?|ttf|eot|svg)([?]?.*)?$/,
        loader: 'url-loader',
        options: {
          name: 'assets/[name].[hash].[ext]',
          limit: 100000,
        },
      },
    ],
  },
};
