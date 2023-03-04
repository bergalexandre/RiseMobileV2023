import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Device, DeviceId } from 'react-native-ble-plx';
import WheelPicker from 'react-native-wheely';


type BluetoothPickerState = {
    devicesId: DeviceId[]
    selectedDeviceId: number;
}

export type BluetoothPickerProps = {
}

export default class BluetoothPicker extends React.Component<BluetoothPickerProps, BluetoothPickerState>
{
    private resolvePromise: ((device: Device) => void) | null = null;
    private devices: Device[];
    private readonly NoDevice: DeviceId = "No device";

    constructor(props:BluetoothPickerProps) {
        super(props);
        this.devices = [],
        this.state = {
            devicesId: [ this.NoDevice ], 
            selectedDeviceId: 0
        };
    }

    
    public AddDevice(device: Device) {
        const selectedDevice = this.devices.find((storedDevice) => storedDevice.id === device.id);
        if(selectedDevice == null || selectedDevice == undefined) {
            if(this.devices.length == 0) {
                this.setState((_) => ({
                    devicesId: [device.id],
                }));    
            } else {
                this.setState((prevState) => ({
                    devicesId: [...prevState.devicesId, device.id],
                }));
            }
            this.devices.push(device);
        }
    }

    public ClearDeviceList() {
        this.devices = []
        this.setState({
            devicesId: [this.NoDevice],
            selectedDeviceId: 0,
        });
    }

    public WaitForDevice(): Promise<Device> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
      }

    private handleValueChange(deviceIndex: number) {
        const selectedDevice = this.devices[deviceIndex]
        if (selectedDevice) {
            if (this.resolvePromise) {
                this.resolvePromise(selectedDevice);
                this.resolvePromise = null;
            }
        }
    }

    render() {
        return (
            <View style={styles.container}>
                <WheelPicker
                    selectedIndex={this.state.selectedDeviceId}
                    options={this.state.devicesId}
                    onChange={(index) => this.handleValueChange(index)}
                />
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
    },
    separator: {
      marginVertical: 30,
      height: 1,
      width: '80%',
    },
    button: {
      fontSize: 24,
      color: "#2e6ddf",
    },
    bigtext: {
      fontSize: 18,
    }
  });
  