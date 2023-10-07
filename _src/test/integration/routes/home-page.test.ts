// import { request } from './helpers';
// import config from 'config';
import { MOCKED_HOME_PAGE } from '../__mocks__/mocked-home-page';

// eslint-disable-next-line import/order
import { agent } from 'supertest';
import { app } from '../../../app';

describe('integration test of routes', () => {
  describe('GET the root', () => {
    it('should return the correct status', async () => {
      const result = await agent(app).get('/');

      expect(result.status).toEqual(302);
    });
  });

  // describe('GET the home page', () => {
  //   it('should return the correct html page', async () => {
  //     const result = await agent(app).get('/home');
  //     // console.log('\nresult: ', `status = ${result.status}`);
  //     // console.log('result.info = ', result.info);
  //     // console.log('result.error = ', result.error);
  //
  //     expect(result.status).toEqual(200);
  //     expect(result).toEqual(MOCKED_HOME_PAGE);
  //   });
  // });
});
