import React from 'react';
import { SettingsModal, SettingsModalProps } from './SettingsModal';

export type SettingsViewProps = Omit<SettingsModalProps, 'isOpen' | 'onClose'> & {
  isOpen?: boolean;
  onClose?: () => void;
};

export const SettingsView: React.FC<SettingsViewProps> = (props) => {
  return (
    <SettingsModal
      isOpen={props.isOpen ?? true}
      onClose={props.onClose ?? (() => {})}
      {...props}
    />
  );
};

export { SettingsModal };
