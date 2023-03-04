import React from 'react';
import { View, StyleSheet, Button, Text } from 'react-native';
import { Device, DeviceId } from 'react-native-ble-plx';
import WheelPicker from 'react-native-wheely';


type BluetoothPickerState = {
    devicesId: DeviceId[];
    selectedDeviceId: number;
    isReady: boolean;
    deviceCount: number;
    isSelected: boolean
}

export type BluetoothPickerProps = {
}

export default class BluetoothPicker extends React.Component<BluetoothPickerProps, BluetoothPickerState>
{
    private resolvePromise: ((device: Device) => void) | null = null;
    private devices: Device[];
    private readonly NoDevice: DeviceId = "No device";
    private timer: NodeJS.Timeout|undefined;

    constructor(props:BluetoothPickerProps) {
        super(props);
        this.devices = [],
        this.state = {
            devicesId: [ this.NoDevice ], 
            selectedDeviceId: 0,
            isReady: false,
            deviceCount: 0,
            isSelected: false
        };
    }

    
    public AddDevice(device: Device) {
        if(device.id == "")
            return;
        const selectedDevice = this.devices.find((storedDevice) => storedDevice.id === device.id);

        let name = device.name ?? device.id;

        if(name.trim() === "") {
            name = device.id
        }
        if(selectedDevice == null || selectedDevice == undefined) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.setState({isReady: true}), 2000);
            if(this.devices.length == 0) {
                this.setState((_) => ({
                    devicesId: [name],
                }));    
            } else {
                this.setState((prevState) => ({
                    devicesId: [...prevState.devicesId, name],
                }));
            }
            this.devices.push(device);
            this.setState((prevState) => ({deviceCount: prevState.deviceCount+1}));
        }
    }

    public ClearDeviceList() {
        this.devices = []
        this.setState({
            devicesId: [this.NoDevice],
            selectedDeviceId: 0,
            isReady: false,
            deviceCount: 0,
            isSelected: false
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
                this.setState({isSelected: true});
                this.resolvePromise(selectedDevice);
                this.resolvePromise = null;
            }
        }
    }

    private deviceSelected(deviceIndex: number) {
        this.setState({selectedDeviceId: deviceIndex});
    }

    render() {
        return (
            <View style={styles.container}>
                {this.state.isReady ? 
                    <View>
                        <Text>Select the device you want to connect</Text>
                        <View style={styles.container}>
                            <WheelPicker
                                visibleRest={10}
                                selectedIndex={this.state.selectedDeviceId}
                                options={this.state.devicesId}
                                onChange={(index) => this.deviceSelected(index)}
                            />
                            <Button
                                onPress={() => this.handleValueChange(this.state.selectedDeviceId)}
                                title={"select"} 
                                disabled={this.state.isSelected}
                                style={styles.button}>
                            </Button>
                        </View>
                    </View>
                    :
                    <View>
                        <Text>Click Start to begin the scanning process.</Text>
                        <Text>Found {this.state.deviceCount} devices</Text>
                    </View>
                }
                
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
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
      flex:1
    },
    bigtext: {
      fontSize: 18,
    },
    WheelPicker: {
        flex: 4
    }
  });
  