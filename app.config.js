const appJson = require('./app.json');

module.exports = ({ config }) => {
  const expo = {
    ...config,
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      widgetsEnabled: process.env.LOOFIT_APP_ONLY !== '1',
    },
    plugins: [...(appJson.expo.plugins ?? [])],
  };

  if (process.env.LOOFIT_APP_ONLY === '1') {
    expo.plugins = expo.plugins.filter((plugin) => {
      if (plugin === 'expo-widgets') {
        return false;
      }
      if (Array.isArray(plugin) && plugin[0] === 'expo-widgets') {
        return false;
      }
      return true;
    });
  }

  return expo;
};
