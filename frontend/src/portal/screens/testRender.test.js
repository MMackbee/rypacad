import React from 'react';
import { renderScreen } from './testRender';
import Field from '../components/Field';

function Probe() {
  const [v, setV] = React.useState('');
  return (
    <div>
      <Field label="Email" value={v} onChange={setV} />
      <span data-probe>{v}</span>
    </div>
  );
}

test('renderScreen fills labelled fields and reads text', async () => {
  const r = await renderScreen(<Probe />, { path: '/portal/x' });
  await r.fill('Email', 'dana@email.com');
  expect(r.container.querySelector('[data-probe]').textContent).toBe('dana@email.com');
  expect(r.location().pathname).toBe('/portal/x');
  await r.unmount();
});
