/* eslint-env browser */

class FieldVimeoController {
  /* @ngInject */
  constructor ($timeout, $http, $log, $mdDialog, ConfigFactory) {
    const vm = this;

    let accessToken;

    try {
      accessToken = ConfigFactory.getConfig().provider.vimeo.access_token;
    } catch (error) {
      //
    }

    if (!accessToken) {
      $log.error(`Required access_token for '${vm.fieldOptions.name}' field is missing`);
      vm.fieldDisabled = true;
      return;
    }

    // http://embed.ly/tools/generator
    vm.embedlyRegex = /(https?:\/\/)?(www\.vimeo\.com\/groups\/.*\/videos\/.*|www\.vimeo\.com\/.*|vimeo\.com\/groups\/.*\/videos\/.*|vimeo\.com\/.*|vimeo\.com\/m\/#\/.*|player\.vimeo\.com\/.*)/i;

    const vimeoRegex = /(?:https?:\/\/)?(?:www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)(?:$|\/|\?)/;

    vm.submitUrl = () => {
      $timeout(() => {
        if (!vm.fieldModel.value || !vm.fieldModel.value.url) {
          return;
        }

        const vimeoId = vm.fieldModel.value.url.match(vimeoRegex)[3];

        $http.get(`https://api.vimeo.com/me/videos/${vimeoId}`, {
          params: {
            access_token: accessToken,
          },
          headers: {
            Accept: 'application/vnd.vimeo.*+json;version=3.2',
            'X-Api-Token': undefined,
          },
        })
          .then((response) => {
            const result = response.data;

            if (!/pro/i.test(result.user.account)) {
              $mdDialog.show(
                $mdDialog.alert()
                  .title('Error')
                  .textContent('Please upgrade to Vimeo Pro')
                  .ok('Close')
              );
              return;
            }

            if (!result.pictures) {
              $mdDialog.show(
                $mdDialog.alert()
                  .title('Error')
                  .textContent('Thumbnail not found')
                  .ok('Close')
              );
              return;
            }

            const thumbnail = result.pictures.sizes[result.pictures.sizes.length - 1];
            const thumbnailUrl = new URL(thumbnail.link);

            if (!result.files) {
              $mdDialog.show(
                $mdDialog.alert()
                  .title('Error')
                  .textContent('Files not found')
                  .ok('Close')
              );
              return;
            }

            const files = result.files.map(file => ({
              width: file.width ? file.width : null,
              height: file.height ? file.height : null,
              fileSize: file.size,
              mimeType: file.type,
              url: file.link_secure,
            }))
              .sort((a, b) => {
                if (!a.width) {
                  return 1;
                }
                if (a.width * a.height > b.width * b.height) {
                  return -1;
                }
                if (a.width * a.height < b.width * b.height) {
                  return 1;
                }
                return 0;
              });

            vm.fieldModel.value.video = {
              provider: 'Vimeo',
              id: vimeoId,
              title: result.name,
              description: result.description,
              tags: result.tags,
              user: {
                id: result.user.uri.replace('/users/', ''),
                name: result.user.name,
              },
              duration: result.duration,
              width: result.width,
              height: result.height,
              thumbnail: {
                url: `${thumbnailUrl.protocol}//${thumbnailUrl.host}${thumbnailUrl.pathname}`,
                width: thumbnail.width,
                height: thumbnail.height,
              },
              files,
            };
          }, (response) => {
            $mdDialog.show(
              $mdDialog.alert()
                .title('Error')
                .textContent(response.data.error || 'Please try again')
                .ok('Close')
            );
          });
      });
    };
  }
}

export default FieldVimeoController;
