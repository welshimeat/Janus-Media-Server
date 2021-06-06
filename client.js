const server = 'welshimeat.site',
    maxPerson = 10,
    record = true;

let janus = null,
    feedId = [],
    feedName = [],
    userName = null,
    room = null,
    videoRoom = null,
    screenSharing = null,
    admin = null;


Janus.init({
    debug: true,
    dependencies: Janus.useDefaultDependencies(),
    callback: function () {
        if (!Janus.isWebrtcSupported()) {
            alert("No WebRTC support... ");
            return;
        }
        // Session 생성
        janus = new Janus(
            {
                server: ['https://' + server + ':8089/janus', 'wss://' + server + ':8989/janus'],
                success: function () {
                    // Plugin Handle 생성
                    janus.attach(
                        {
                            plugin: "janus.plugin.videoroom",
                            success: function (pluginHandle) {
                                videoRoom = pluginHandle;
                                console.log("Webcam Plugin Handle이 생성됨 : " + videoRoom.getPlugin());
                                $('#temp').click(sendData);

                                admin = confirm("방을 생성하시겠습니까? (확인 - 생성 / 취소 - 참가)"); //확인은 true, 취소는 false 반환
                                if (admin) {
                                    room = Number(prompt("생성하려는 방 코드를 입력하세요"));
                                    userName = prompt("사용자 이름을 입력하세요");
                                    let register = {
                                        request: "create",
                                        bitrate: 512000,
                                        room: room,
                                        publishers: maxPerson * 2,
                                        record: record,
                                        rec_dir: "/opt/janus/share/janus/recordings"
                                    };
                                    videoRoom.send({message: register});
                                    register = {
                                        request: "join",
                                        room: room,
                                        ptype: "publisher",
                                        display: userName
                                    };
                                    videoRoom.send({message: register});
                                }
                                else {
                                    room = Number(prompt("참여하려는 방 코드를 입력하세요"));
                                    userName = prompt("사용자 이름을 입력하세요");
                                    let register = {
                                        request: "join",
                                        room: room,
                                        ptype: "publisher",
                                        display: "w" + userName
                                    };
                                    attachScreen();
                                    videoRoom.send({message: register});
                                }
                            },
                            error: function (cause) {
                                console.log("Webcam Plugin Handle attach 에러 : " + cause);
                            },
                            iceState: function (state) {
                                console.log("Webcam Plugin Handle ICE 상태 변경 : " + state);
                            },
                            mediaState: function (medium, on) {
                                console.log("Webcam Plugin Handle이 " + medium + (on ? "을 받기 시작함" : "을 더이상 받지 않음"));
                            },
                            webrtcState: function (on) {
                                console.log("Webcam Plugin Handle WebRTC PeerConnection이 " + (on ? "진행중" : "종료됨"));
                            },
                            onmessage: function (msg, jsep) {
                                console.log("Webcam Publisher 메시지 : ", msg);
                                var event = msg["videoroom"];
                                if (event) {
                                    if (event === "joined" || event === "created") {
                                        if (!admin) {
                                            videoRoom.createOffer({
                                                media : {
                                                    audioSend: true, audioRecv: false, videoSend: true, videoRecv: false, data : true
                                                },
                                                success: function (jsep) {
                                                    var publish = {
                                                        request: "configure",
                                                        audio: true,
                                                        data: true,
                                                        video: true,
                                                        record: record,
                                                        filename: userName + "_webcam"
                                                    };
                                                    videoRoom.send({"message": publish, "jsep": jsep});
                                                },
                                                error: function (error) {
                                                    console.log("Webcam Plugin Handle createOffer 에러 : " + error);
                                                }
                                            });
                                        } else {
                                            if (msg["publishers"]) {
                                                var list = msg["publishers"];
                                                console.log("현재 참여한 사람들 :", list);
                                                for (var f in list) {
                                                    var id = list[f]["id"];
                                                    var display = list[f]["display"];
                                                    var audio = list[f]["audio_codec"];
                                                    var video = list[f]["video_codec"];
                                                    console.log("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                                                    feedId.push(id);
                                                    feedName.push(display);
                                                    newRemoteFeed(id, display, audio, video);
                                                }
                                            }
                                        }
                                    }
                                    else if (msg["leaving"]) {
                                        let id = msg["leaving"];
                                        console.log("참여자가 떠남 : " + id);
                                        let index = feedId.indexOf(id);
                                        feedId.splice(index, 1);
                                        $("#" + feedName[index].substring(1)).remove();
                                        feedName.splice(index, 1);
                                    }
                                    else if (msg["publishers"]) {
                                        if (admin) {
                                            var publisher = msg["publishers"];
                                            console.log("추가로 참여한 사람 :", publisher[0]);
                                            var id = publisher[0]["id"];
                                            var display = publisher[0]["display"];
                                            var audio = publisher[0]["audio_codec"];
                                            var video = publisher[0]["video_codec"];
                                            console.log("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                                            feedId.push(id);
                                            feedName.push(display);
                                            newRemoteFeed(id, display, audio, video);
                                        }
                                    }
                                }
                                if(jsep) {
                                    console.log("Webcam Plugin Handle SDP 조정 : ", jsep);
                                    videoRoom.handleRemoteJsep({jsep: jsep});
                                }
                            },
                            onlocalstream: function (stream) {
                                console.log("local webcam stream 도착 : ", stream);
                                if(!$('#'+ userName).get(0)){
                                    $('#main').append($('<div />').attr("class", "block").attr("id", userName));
                                    $('#'+userName).append($('<div />').attr("class", "name").html(userName));
                                    $('#'+userName).append($('<video controls="true" autoplay playsinline muted="muted"/>').attr("class", "video").attr("id", "webcam"));
                                    $('#'+userName).append($('<video controls="true" autoplay playsinline muted="muted"/>').attr("class", "video").attr("id", "screen"));
                                }
                                Janus.attachMediaStream($('#'+ userName + " video").get(0), stream);
                            },
                            onremotestream: function (stream) {
                                // We have a remote stream (working PeerConnection!) to display
                            },
                            oncleanup: function () {
                                $("#localvideo").remove();
                                console.log("Webcam Plugin Handle이 종료됨");
                                console.log("@@@");
                            }
                        }
                    );
                },
                error: function (cause) {
                    console.log("Session 생성 에러 : " + cause);
                },
                destroyed: function () {
                    console.log("Session이 종료됨");
                }
            });
    }
});

function newRemoteFeed(id, display, audio, video) {
    var remoteFeed = null;
    janus.attach(
        {
            plugin: "janus.plugin.videoroom",
            success: function(pluginHandle) {
                remoteFeed = pluginHandle;
                console.log("Remote Plugin Handle이 생성됨 : " + remoteFeed.getPlugin());
                var subscribe = {
                    request: "join",
                    room: room,
                    ptype: "subscriber",
                    feed: id
                };
                remoteFeed.audioCodec = audio;
                remoteFeed.videoCodec = video;
                remoteFeed.send({ message: subscribe });
            },
            error: function(error) {
                console.log("Remote Plugin Handle attach 에러 : " + cause);
            },
            onmessage: function(msg, jsep) {
                console.log("Remote Subscriber 메시지 : ", msg);
                var event = msg["videoroom"];
                if(event) {
                    if(event === "attached") {
                        console.log(msg["room"] + "에 성공적으로 attach됨");

                        let displayName = display.substring(1);
                        if(!$('#'+ displayName).get(0)){
                            $('#main').append($('<div />').attr("class", "block").attr("id", displayName));
                            $('#'+displayName).append($('<div />').attr("class", "name").html(displayName));
                            $('#'+displayName).append($('<video controls="true" autoplay playsinline muted="muted"/>').attr("class", "video").attr("id", "webcam"));
                            $('#'+displayName).append($('<video controls="true" autoplay playsinline muted="muted"/>').attr("class", "video").attr("id", "screen"));
                        }
                    }
                }
                if(jsep) {
                    console.log("remote에 jsep : ", jsep);
                    remoteFeed.createAnswer(
                        {
                            jsep: jsep,
                            media: { audioSend: false, videoSend: false, data: true},
                            success: function(jsep) {
                                console.log("Remote Plugin Handle createAnswer 성공 : " + jsep);
                                var body = { request: "start", room: room };
                                remoteFeed.send({ message: body, jsep: jsep });
                            },
                            error: function(error) {
                                console.log("Remote Plugin Handle createAnswer 에러 : " + error);
                            }
                        });
                }
            },
            iceState: function(state) {
                console.log("Remote Plugin Handle ICE 상태 변경 : " + state);
            },
            webrtcState: function(on) {
                console.log("Remote Plugin Handle WebRTC PeerConnection이 " + (on ? "진행중" : "종료됨"));
            },
            onlocalstream: function(stream) {
            },
            onremotestream: function(stream) {
                console.log("remote stream 도착 : ", stream);
                let displayName = display.substring(1);
                if(display[0] === "w"){
                    Janus.attachMediaStream($('#'+ displayName + " video").get(0), stream);
                }
                else if(display[0] === "s")
                    Janus.attachMediaStream($('#'+ displayName + " video").get(1), stream);
                var videoTracks = stream.getVideoTracks();
            },
            ondataopen: function(data) {
                console.log("DataChannel 사용 가능", data);
            },
            ondata: function(data) {
                console.log("Remote Plugin DataChannel에 데이터 도착", data);
                alert(data);
            },
            oncleanup: function() {
                console.log("Remote Plugin Handle이 종료됨");
            }
        });
}

function attachScreen(){
    janus.attach(
        {
            plugin: "janus.plugin.videoroom",
            success: function (pluginHandle) {
                screenSharing = pluginHandle;
                console.log("Screen Plugin Handle이 생성됨 : " + screenSharing.getPlugin());
                var register = {
                    request: "join",
                    room: room,
                    ptype: "publisher",
                    display: "s" + userName
                };
                screenSharing.send({message: register});
            },
            error: function (cause) {
                console.log("Screen Plugin Handle attach 에러 : " + cause);
            },
            iceState: function (state) {
                console.log("Screen Plugin Handle ICE 상태 변경 : " + state);
            },
            mediaState: function (medium, on) {
                console.log("Screen Plugin Handle이 " + medium + (on ? "을 받기 시작함" : "을 더이상 받지 않음"));
            },
            webrtcState: function (on) {
                console.log("Screen Plugin Handle WebRTC PeerConnection이 " + (on ? "진행중" : "종료됨"));
            },
            onmessage: function (msg, jsep) {
                console.log("Screen Publisher 메시지 : ", msg);
                var event = msg["videoroom"];
                if (event) {
                    if (event === "joined") {
                        screenSharing.createOffer({
                            media: { video: "screen", audioRecv: false, videoRecv: false},
                            success: function (jsep) {
                                var publish = {
                                    request: "configure",
                                    audio: false,
                                    video: true,
                                    record: record,
                                    filename: userName + "_screen"
                                };
                                screenSharing.send({"message": publish, "jsep": jsep});
                            },
                            error: function (error) {
                                console.log("Screen Plugin Handle createOffer 에러 : " + error);
                            }
                        });
                    }
                }
                if (jsep) {
                    console.log("Screen Plugin Handle SDP 조정 : ", jsep);
                    screenSharing.handleRemoteJsep({jsep: jsep});
                }
            },
            onlocalstream: function (stream) {
                console.log("local screen stream 도착 : ", stream);
                if(!$('#'+ userName).get(0)){
                    $('#main').append($('<div />').attr("class", "block").attr("id", userName));
                    $('#'+userName).append($('<div />').attr("class", "name").html(userName));
                    $('#'+userName).append($('<video controls="true" autoplay playsinline muted="muted"/>').attr("class", "video").attr("id", "webcam"));
                    $('#'+userName).append($('<video controls="true" autoplay playsinline muted="muted"/>').attr("class", "video").attr("id", "screen"));
                }
                Janus.attachMediaStream($('#'+ userName + " video").get(1), stream);
            },
            onremotestream: function (stream) {
            },
            oncleanup: function () {
                $("#localscreen").remove();
                console.log("Screen Plugin Handle 종료됨");
            }
        }
    );
}

function sendData() {
    videoRoom.data({
        text: userName,
        error: function(reason) { alert(reason); },
        success: function() { console.log("메시지 전성 완료");},
    });
}