const _ = require('lodash');
const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const compression = require('compression');
const errorHandler = require('errorhandler');
const passwordHash = require('password-hash');
const qs = require('querystring');
const RedisStore = require('connect-redis')(session);
const helmet = require('helmet');
const useragent = require('express-useragent');
const passport = require('passport');

const AceApi = require('../../ace-api');
const AceApiServer = require('../../ace-api-server');

const packageJson = require('../package.json');
const defaultConfig = require('./config.default');
const defaultApiConfig = require('../../ace-api/config.default');

const VERSION = packageJson.version;

/* App */

class AceCms {
  constructor (app, config, apiConfig) {
    config = _.merge({}, defaultConfig, config);
    apiConfig = _.merge({}, defaultApiConfig, apiConfig);

    app.use(helmet());
    app.set('trust proxy', true);
    app.set('views', `${__dirname}/views`);
    app.set('view engine', 'ejs');
    app.use(errorHandler());
    app.use(logger('dev'));
    app.use(cookieParser());
    app.use(bodyParser.json({
      limit: '50mb',
    }));
    app.use(bodyParser.urlencoded({
      extended: true,
      limit: '50mb',
    }));
    app.use(methodOverride());
    app.use(useragent.express());
    app.use(compression());

    /* Session */

    if (config.environment !== 'production') {
      app.use(session({
        secret: config.session.secret,
        resave: true,
        saveUninitialized: true,
      }));

    } else {
      app.use(session({
        store: new RedisStore({
          host: config.redis.host,
          port: config.redis.port,
          ttl: config.session.ttl,
          pass: config.redis.password,
        }),
        secret: config.session.secret,
        resave: true,
        saveUninitialized: true,
      }));
    }

    /* Passport */

    require('./passport.strategy.auth0')(config);
    app.use(passport.initialize());
    app.use(passport.session());

    /* Router */

    const router = express.Router();
    app.use(`${config.basePath}`, router);

    /* Static */

    router.use(express.static(path.resolve(__dirname, '../public')));

    if (fs.existsSync(path.resolve(__dirname, '../node_modules'))) {
      router.use('/angular-i18n', express.static(path.resolve(__dirname, '../node_modules/angular-i18n')));
    } else {
      router.use('/angular-i18n', express.static(path.resolve(__dirname, '../../angular-i18n')));
    }

    /* Force https */

    const forceHttps = (req, res, next) => {
      if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
        res.redirect(301, `https://${req.headers.host}${req.path}`);
        return;
      }
      next();
    };

    if (config.environment === 'production' && config.forceHttps === true) {
      router.use(forceHttps);
    }

    /* Force www */

    const forceWww = (req, res, next) => {
      const hostParts = req.headers.host.split('.');
      if (hostParts[0] !== 'www') {
        res.redirect(301, `${req.protocol}://www.${req.headers.host}${req.originalUrl}`);
        return;
      }
      next();
    };

    if (config.environment === 'production' && config.forceWww === true) {
      router.use(forceWww);
    }

    /* Auth */

    const ensureAuthenticated = (req, res, next) => {
      req.session.referer = req.originalUrl;

      if (config.environment === 'development') {
        const jwt = new AceApi.Jwt(apiConfig);

        req.session.apiToken = jwt.signToken({
          userId: apiConfig.dev.userId,
          slug: req.session.slug || apiConfig.dev.slug,
          role: apiConfig.dev.role,
        });

        next();
        return;
      }

      if (req.isAuthenticated()) {
        next();
        return;
      }

      if (req.xhr || (req.headers.accept && /json/i.test(req.headers.accept))) {
        res.status(401);
        res.send({
          code: 401,
          message: 'Not authorised',
        });
        return;
      }

      const querystring = Object.keys(req.query).length ? `?${qs.stringify(req.query)}` : '';
      res.redirect(`${config.basePath}login${querystring}`);
    };

    /* Register API Server */

    AceApiServer(router, apiConfig, ensureAuthenticated);

    /* Verify */

    const verifyUser = (req, res, next) => {
      if (!req.query.code) {
        next();
        return;
      }

      const authenticate = passport.authenticate('auth0', { failureRedirect: `${config.basePath}login` });

      authenticate(req, res, (error) => {
        if (error) {
          res.status(error.status);
          res.send(error);
          return;
        }

        const userId = req.user.emails[0].value; // TODO: Replace email as userId?

        const auth = new AceApi.Auth(apiConfig);
        const jwt = new AceApi.Jwt(apiConfig);

        auth.authoriseUser(userId)
          .then((user) => {
            req.session.accessToken = req.query.access_token;
            req.session.idToken = req.query.id_token;

            const payload = {
              userId,
              role: user.role,
            };

            req.session.userId = userId;
            req.session.role = user.role;

            if (user.slug) { // user.slug is undefined for super user
              payload.slug = user.slug;
              req.session.slug = user.slug;
            }

            req.session.apiToken = jwt.signToken(payload, {
              expiresIn: 7200,
            });

            res.redirect(config.basePath);

          }, (reason) => {
            console.error(reason);

            req.session.errorMessage = reason;

            res.redirect(`${config.basePath}login`);
          });
      });
    };

    /* Routes */

    router.get('/login', verifyUser, (req, res) => {
      const messages = {
        logout: 'Logged out successfully',
      };

      let errorMessage = req.session.errorMessage || false;
      let successMessage = req.session.successMessage || false;

      if (req.query.error) {
        errorMessage = messages[req.query.error] ? messages[req.query.error] : false;
      }

      if (req.query.success) {
        successMessage = messages[req.query.success] ? messages[req.query.success] : false;
      }

      const data = {
        basePath: config.basePath,
        environment: config.environment,
        version: VERSION,
        forceHttps: config.forceHttps,
        errorMessage,
        successMessage,
        auth0: {
          clientId: config.auth0.clientId,
          domain: config.auth0.domain,
        },
      };

      req.session.errorMessage = null;
      req.session.successMessage = null;

      res.render('login', data);
    });

    router.post('/logout', (req, res) => {
      req.logout();
      req.session.destroy(() => {
        res.status(200);
        res.send('Logged out successfully');
      });
    });

    router.get('/logout', (req, res) => {
      req.logout();
      req.session.destroy(() => {
        res.redirect(`${config.basePath}?success=logout`);
      });
    });

    router.get('/switch', ensureAuthenticated, (req, res) => {
      if (req.session.role === 'super' || config.environment === 'development') {
        if (req.query.slug) {
          req.session.slug = req.query.slug;

          const jwt = new AceApi.Jwt(apiConfig);

          req.session.apiToken = jwt.signToken({
            userId: req.session.userId,
            slug: req.session.slug,
            role: req.session.role,
          });

          if (req.session.referer && req.session.referer.indexOf('/switch') === -1) {
            return res.redirect(req.session.referer);
          }

          return res.redirect(config.basePath);
        }

        return res.render('switch', {
          basePath: config.basePath,
          environment: config.environment,
          version: VERSION,
          slugs: config.slugs.split(','),
        });
      }

      return res.redirect(`${config.basePath}logout`);
    });

    /* Index */

    let assistCredentials = new Buffer(`${config.assist.username}:${passwordHash.generate(config.assist.password)}`);
    assistCredentials = assistCredentials.toString('base64');

    function index (req, res) {
      res.render('index', {
        basePath: config.basePath,
        environment: config.environment,
        version: VERSION,
        assistUrl: config.assist.url,
        assistCredentials,
        apiPrefix: apiConfig.apiPrefix,
        session: req.session,
      });
    }

    router.use(ensureAuthenticated, (req, res) => {
      // if (req.headers.accept && req.headers.accept.indexOf('application/json') > -1) {
      //   res.status(404);
      //   res.send('Not found');
      //   return;
      // }

      if (req.session.role === 'super' && !req.session.slug) {
        res.redirect(`${config.basePath}switch`);
        return;
      }

      index(req, res);
    });

    return app;
  }
}

module.exports = AceCms;
