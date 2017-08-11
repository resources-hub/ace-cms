import _ from 'lodash';
import userModalTemplate from './user.modal.jade';

const UserFactory = function UserFactory ($http, $mdDialog, ConfigFactory, HelperFactory, appConfig) {
  'ngInject';

  const service = {};

  function DialogController ($mdDialog) {
    'ngInject';

    const vm = this;

    vm.cancel = () => $mdDialog.cancel();
    vm.ok = item => $mdDialog.hide(item);
  }

  service.editUser = async (userId, event) => {
    const defaultUser = {
      active: true,
      role: 'admin',
    };

    let user = userId ? ConfigFactory.getUser(userId) : defaultUser;

    let config = ConfigFactory.getConfig();

    // const existing = new RegExp(`^(${config.users.map(user => user.email).join('|')})$`);

    const userDialog = {
      controller: DialogController,
      bindToController: true,
      controllerAs: 'vm',
      template: userModalTemplate,
      targetEvent: event,
      clickOutsideToClose: true,
      locals: {
        user,
        // existingPattern: ((() => ({
        //   test(value) {
        //     return !existing.test(value) || value === userId;
        //   },
        // })))(),
      },
    };

    try {
      user = await $mdDialog.show(userDialog);
    } catch (error) {
      return false;
    }

    if (!user.id) {
      user.id = user.email;
      config = (await $http.post(`${appConfig.apiUrl}/user`, { user })).data;
    } else {
      config = (await $http.put(`${appConfig.apiUrl}/user`, { user })).data;
    }

    ConfigFactory.setConfig(config);

    return user;
  };

  service.deleteUsers = async (userIds, event) => {
    const confirmDialog = $mdDialog.confirm({
      title: 'Delete User?',
      textContent: 'Are you sure you want to delete the selected users?',
      targetEvent: event,
      ok: 'Confirm',
      cancel: 'Cancel',
    });

    try {
      await $mdDialog.show(confirmDialog);
    } catch (error) {
      return false;
    }

    const config = (await $http.delete(`${appConfig.apiUrl}/user`, { params: { userIds } })).data;

    ConfigFactory.setConfig(config);

    return true;
  };

  return service;
};

export default UserFactory;
