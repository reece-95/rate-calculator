const { CLOUD_ENV } = require('./config.js');

App({
    onLaunch() {
        if (!wx.cloud) {
            console.error('[app] 当前微信版本过低，无法使用云开发');
            return;
        }
        // 不指定 env 时使用默认的云开发环境
        wx.cloud.init(CLOUD_ENV ? { env: CLOUD_ENV, traceUser: false } : { traceUser: false });
    }
});
