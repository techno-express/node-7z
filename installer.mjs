#!/usr/bin/env node

'use strict';

import fs from 'fs-extra';
import {
  fileURLToPath
} from 'url';
import {
  dirname,
  join,
  sep,
} from 'path';
import spawn from 'cross-spawn';
import unCompress from 'all-unpacker';
import retryPromise from 'retrying-promise';
import fetching from 'node-wget-fetch';
import system_installer from 'system-installer';
import macos_release from 'macos-release';

const __filename = fileURLToPath(
  import.meta.url);
const __dirname = dirname(__filename);

const versionCompare = (left, right) => {
  if (typeof left + typeof right != 'stringstring')
    return false;

  let a = left.split('.');
  let b = right.split('.');
  let i = 0;
  let len = Math.max(a.length, b.length);

  for (; i < len; i++) {
    if ((a[i] && !b[i] && parseInt(a[i]) > 0) || (parseInt(a[i]) > parseInt(b[i]))) {
      return 1;
    } else if ((b[i] && !a[i] && parseInt(b[i]) > 0) || (parseInt(a[i]) < parseInt(b[i]))) {
      return -1;
    }
  }

  return 0;
}

const appleOs = (process.platform == "darwin") ? macos_release.version : '99.99.99',
  macOsVersion = (versionCompare(appleOs, '10.11.12') == 1) ? '10.15' : '10.11',
  _7zAppUrl = 'https://7-zip.org/a/',
  cwd = process.cwd(),
  binaryDestination = join(__dirname, 'binaries', process.platform);

const windowsPlatform = {
  source: join(cwd, '7z1900-extra.7z'),
  destination: join(cwd, 'win32'),
  url: 'https://d.7-zip.org/a/',
  filename: '7z1900-extra.7z',
  extraName: 'lzma1900.7z',
  extractFolder: '',
  appLocation: '',
  binaryFiles: ['Far', 'x64', '7za.dll', '7za.exe', '7zxa.dll'],
  binaryDestinationDir: join(__dirname, 'binaries', 'win32'),
  sfxModules: ['7zr.exe', '7zS2.sfx', '7zS2con.sfx', '7zSD.sfx'],
  platform: 'win32',
  binary: '7za.exe',
  extraSourceFile: join(cwd, 'win32', 'lzma1900.7z'),
};

const windowsOtherPlatform = {
  source: join(cwd, '7z1604-extra.7z'),
  destination: join(cwd, 'other32'),
  url: 'https://d.7-zip.org/a/',
  filename: '7z1604-extra.7z',
  extraName: 'lzma1604.7z',
  extractFolder: '',
  appLocation: '',
  binaryFiles: ['Far', 'x64', '7za.dll', '7za.exe', '7zxa.dll'],
  binaryDestinationDir: join(__dirname, 'binaries', 'win32', 'other32'),
  sfxModules: ['7zr.exe', '7zS2.sfx', '7zS2con.sfx', '7zSD.sfx'],
  platform: 'win32',
  binary: '7za.exe',
  extraSourceFile: join(cwd, 'other32', 'lzma1604.7z'),
};

const linuxPlatform = {
  source: join(cwd, 'p7zip_16.02_x86_linux_bin.tar.bz2'),
  destination: join(cwd, 'linux'),
  url: 'https://iweb.dl.sourceforge.net/project/p7zip/p7zip/16.02/',
  filename: 'p7zip_16.02_x86_linux_bin.tar.bz2',
  extraName: 'lzma1604.7z',
  extractFolder: 'p7zip_16.02',
  appLocation: 'bin',
  binaryFiles: ['7z', '7z.so', '7za', '7zCon.sfx', '7zr', 'Codecs'],
  binaryDestinationDir: join(__dirname, 'binaries', 'linux'),
  sfxModules: ['7zS2.sfx', '7zS2con.sfx', '7zSD.sfx'],
  platform: 'linux',
  binary: '7za',
  extraSourceFile: join(cwd, 'linux', 'lzma1604.7z'),
};

const macVersion = (macOsVersion == '10.15') ? 'p7zip-16.02-macos10.15.pkg' : 'p7zip-16.02-macos10.11.pkg';
const appleMacPlatform = {
  source: join(cwd, macVersion),
  destination: join(cwd, 'darwin'),
  url: 'https://raw.githubusercontent.com/rudix-mac/packages/master/',
  filename: macVersion,
  extraName: 'lzma1604.7z',
  extractFolder: '',
  appLocation: 'usr/local/lib/p7zip',
  binaryFiles: ['7z', '7z.so', '7za', '7zCon.sfx', '7zr', 'Codecs'],
  binaryDestinationDir: join(__dirname, 'binaries', 'darwin'),
  sfxModules: ['7zS2.sfx', '7zS2con.sfx', '7zSD.sfx'],
  platform: 'darwin',
  binary: '7za',
  extraSourceFile: join(cwd, 'darwin', 'lzma1604.7z'),
};

function retrieve(path = {
  url: '',
  dest: ''
}) {
  console.log('Downloading ' + path.url);
  return new Promise((resolve, reject) => {
    fetching.wget(path.url, path.dest)
      .then((info) => resolve(info))
      .catch((err) => reject('Error downloading file: ' + err));
  });
}

function platformUnpacker(platformData = windowsPlatform) {
  return new retryPromise({
    retries: 5
  }, (resolve, retry) => {
    retrieve({
      url: platformData.url + platformData.filename,
      dest: platformData.source
    }).then(() => {
      console.log('Extracting: ' + platformData.filename);
      if (platformData.platform == 'darwin') {
        let destination = platformData.destination;
        if (process.platform == 'win32') {
          macUnpack(platformData)
            .then(() => {
              return resolve('darwin');
            }).catch((err) => retry(err));
        } else {
          unpack(platformData.source, destination)
            .then((data) => {
              console.log('Decompressing: p7zipinstall.pkg/Payload');
              unpack(join(destination, 'p7zipinstall.pkg', 'Payload'), destination).then(() => {
                  console.log('Decompressing: Payload');
                  unpack(join(destination, 'Payload'), destination, platformData.appLocation + sep + '*').then(() => {
                      return resolve('darwin');
                    })
                    .catch((err) => retry(err));
                })
                .catch((err) => retry(err));
            })
            .catch((err) => retry(err));
        }
      } else if (platformData.platform == 'win32') {
        unpack(platformData.source, platformData.destination)
          .then(() => {
            return resolve('win32');
          })
          .catch((err) => retry(err));
      } else if (platformData.platform == 'linux') {
        unpack(platformData.source, platformData.destination)
          .then(() => {
            const system = system_installer.packager();
            const toInstall = (system.packager == 'yum' || system.packager == 'dnf') ?
              'glibc.i686' : 'libc6-i386';
            if (process.platform == 'linux')
              system_installer.installer(toInstall).then(() => {
                return resolve('linux');
              });
            else
              return resolve('linux');
          })
          .catch((err) => retry(err));
      } else if (fetching.isString(platformData.platform)) {
        unpack(platformData.source, platformData.destination)
          .then(() => {
            return resolve(platformData.platform);
          })
          .catch((err) => retry(err));
      }
    }).catch((err) => retry(err));
  }).catch((err) => console.error(err));
}

function unpack(source, destination, toCopy) {
  return new Promise((resolve, reject) => {
    return unCompress.unpack(
      source, {
        files: (toCopy == null ? '' : toCopy),
        targetDir: destination,
        forceOverwrite: true,
        noDirectory: true,
        quiet: true,
      },
      (err, files, text) => {
        if (err)
          return reject(err);
        console.log(text);
        return resolve(files);
      }
    );
  });
}

function extraUnpack(cmd = '', source = '', destination = '', toCopy = []) {
  let args = ['e', source, '-o' + destination];
  let extraArgs = args.concat(toCopy).concat(['-r', '-aos']);
  console.log('Running: ' + cmd + ' ' + extraArgs);
  return spawnSync(cmd, extraArgs);
}

function macUnpack(dataFor = appleMacPlatform, dataForOther = windowsOtherPlatform) {
  return new Promise((resolve, reject) => {
    retrieve({
        url: dataForOther.url + '7z1805-extra.7z',
        dest: '.' + sep + '7z-extra.7z'
      })
      .then(() => {
        let destination = join(cwd, 'other');
        unpack(join(__dirname, '7z-extra.7z'), destination)
          .then(() => {
            extraUnpack(join(__dirname, 'other', '7za.exe'), dataFor.source, dataFor.destination);
            console.log('Decompressing: ' + 'p7zip-16.02-macos10.15');
            unpack(join(dataFor.destination, 'p7zip-16.02-macos10.15'), dataFor.destination)
              .then(() => {
                fs.emptyDir(destination).then(() => {
                  fs.unlink(join(__dirname, '7z-extra.7z')).then(() => {
                    fs.removeSync(destination);
                    return resolve('darwin');
                  });
                });
              })
              .catch(() => {
                fs.emptyDir(destination).then(() => {
                  fs.unlink(join(__dirname, '7z-extra.7z')).then(() => {
                    fs.removeSync(destination);
                    return resolve('darwin');
                  });
                });
              });
          }).catch((err) => reject);
      }).catch((err) => reject);
  });
}

function spawnSync(spCmd = '', spArgs = []) {
  let doUnpack = spawn.sync(spCmd, spArgs, {
    stdio: 'pipe'
  });
  if (doUnpack.error) {
    console.error('Error 7za exited with code ' + doUnpack.error);
    console.error('resolve the problem and re-install using:');
    console.error('npm install');
  }
  return doUnpack;
}

function makeExecutable(binary = [], binaryFolder = '') {
  binary.forEach((file) => {
    try {
      if (file == 'Codecs')
        file = 'Codecs' + sep + 'Rar.so'
      fs.chmodSync(join(binaryFolder, file), 755);
    } catch (err) {
      console.error(err);
    }
  });
}

[windowsOtherPlatform, windowsPlatform, linuxPlatform, appleMacPlatform].forEach((dataFor) => {
  fs.mkdir(dataFor.destination, (err) => {
    if (err) {}
    retrieve({
        url: _7zAppUrl + dataFor.extraName,
        dest: dataFor.extraSourceFile
      })
      .then(() => {
        platformUnpacker(dataFor)
          .then(() => {
            dataFor.binaryFiles.forEach((file) => {
              try {
                let from = join(dataFor.destination, dataFor.extractFolder, dataFor.appLocation, file);
                let to = join(dataFor.binaryDestinationDir, file);
                if (file == '7zCon.sfx') {
                  file = '7zCon' + dataFor.platform + '.sfx';
                  let location = join(binaryDestination, (process.platform == 'win32' ? 'other32' : ''));
                  to = join(location, file);
                  fs.moveSync(from, to, {
                    overwrite: true
                  });
                  makeExecutable([file], location);
                  console.log('Sfx module ' + file + ' copied successfully!');
                } else if (dataFor.platform == process.platform) {
                  fs.moveSync(from, to, {
                    overwrite: true
                  });

                  if (dataFor.platform != 'win32')
                    makeExecutable([file], dataFor.binaryDestinationDir);
                }
              } catch (err) {
                console.error(err);
              }
            });

            console.log('Binaries copied successfully!');
            fs.unlinkSync(dataFor.source);

            if (process.platform == dataFor.platform) {
              setTimeout(() => {
                extraUnpack(join(dataFor.binaryDestinationDir, dataFor.binary),
                  dataFor.extraSourceFile,
                  binaryDestination,
                  dataFor.sfxModules
                );

                fs.unlink(dataFor.extraSourceFile, (err) => {
                  if (err) throw err;
                  dataFor.sfxModules.forEach((file) => {
                    let name = file.replace(/.sfx/g, (dataFor.destination.includes('win32') ? '' : 'other32') + '.sfx');
                    let to = join(binaryDestination, ((name.includes('other32') && process.platform == 'win32') ? 'other32' : ''), name);
                    if (name.includes('other32')) {
                      fs.renameSync(join(binaryDestination, file), to);
                    }

                    console.log('Sfx module ' + name + ' copied successfully!');
                  });
                  fs.removeSync(dataFor.destination);
                });
              }, 5000);
            } else {
              fs.removeSync(dataFor.destination);
            }

          })
          .catch((err) => {
            console.error('Unpacking for platform failed.');
            throw (err);
          });
      })
      .catch((err) => {
        console.error('Error downloading file: ' + err);
      });
  });
});
