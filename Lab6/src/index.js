import { vec3, mat4, mat3 } from 'gl-matrix';

import textureURL from 'url:./88.png';
//import textureURL from 'url:./mmcs.jpg';

document.addEventListener('DOMContentLoaded', setup);

const canvas = document.getElementById('canvas');
const fps = document.getElementById("FPS");
const gl = canvas.getContext('webgl2');
gl.viewport(0, 0, canvas.width, canvas.height);

const cameraPos = [0.0, 0.0, 5.0];

const PARTICLE_COUNT = 30000;
const mode = 2;

let VBO_geometry, VBO_instancePos, VBO_TexCoord;
let program1, program2;
let positionAttribID = 0, colorAttribID = 1;
let startTime;

const vertexShaderSource1 = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec3 instancePos;

    uniform vec2 minPos;
    uniform vec2 maxPos;
    
    uniform mat4 model;
    uniform mat4 viewProjection;

    out vec2 TexCoord;

    void main() {
        vec4 worldPos = vec4(position + instancePos, 1.0);
        gl_Position = viewProjection * model * worldPos;
        gl_PointSize = 4.0;
        float x = (instancePos.x - minPos.x) / (maxPos.x - minPos.x);
        float y = (instancePos.y - minPos.y) / (maxPos.y - minPos.y);
        TexCoord = vec2(x, 1.0 - y);
    }
`;

const vertexShaderSource2 = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec3 instancePos;
    layout (location = 2) in vec2 texCoord;
    
    uniform mat4 model;
    uniform mat4 viewProjection;

    out vec2 TexCoord;

    void main() {
        vec4 worldPos = vec4(position + instancePos, 1.0);
        gl_Position = viewProjection * model * worldPos;
        gl_PointSize = 4.0;
        TexCoord = vec2(texCoord.x, 1.0 - texCoord.y);
    }
`;

const fragmentShaderSource1 = `#version 300 es
    precision mediump float;
    precision mediump int;

    in vec2 TexCoord;

    uniform sampler2D textureSampler;

    out vec4 color;

    void main() {
        color = texture(textureSampler, TexCoord);
    }
`;

class Point{
    constructor(x, y){
        this.x = x;
        this.y = y;
    }
}

function random(min, max){
    return min + Math.random() * (max - min);
}

function len(point){
    return Math.sqrt(point.x * point.x + point.y * point.y);
}

function normalize(point){
    let length = len(point)
    if (length == 0) return new Point(0, 0);
    return new Point(point.x / length, point.y / length);
}

function dot(a, b){
    return a.x * b.x + a.y * b.y;
}

function distance(a, b){
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

class Particle1{
    static particleCount = PARTICLE_COUNT;

    constructor() {
        this.init();
    }

    init() {
        this.timeFromCreation = performance.now();

        const angle = random(0, Math.PI * 2);

        const radius = random(0.5, 2);

        this.xMax = Math.cos(angle) * radius;
        this.yMax = Math.sin(angle) * radius;

        const multiplier = 125 + Math.random() * 125;
        this.dx = this.xMax / multiplier;
        this.dy = this.yMax / multiplier;

        this.x = (this.dx * 1000) % this.xMax;
        this.y = (this.dy * 1000) % this.yMax;
    }

    move(time){
        const timeShift = (time - this.timeFromCreation) / 10;
        this.timeFromCreation = time;
        // приращение зависит от времени между отрисовками
        const speed = 1.0;
        this.x += this.dx * speed * timeShift;
        this.y += this.dy * speed * timeShift;
        // если искра достигла конечной точки, запускаем её заново из начала координат
        if (Math.abs(this.x) > Math.abs(this.xMax) || Math.abs(this.y) > Math.abs(this.yMax)) {
            this.init();
            return;
        }
    }
}

class Particle2 {
    static particleCount = PARTICLE_COUNT;

    constructor() {
        this.init();
    }

    init(){
        this.startTime = performance.now();
        this.homing = false;
        
        const aspect = textureSize[0] / textureSize[1];

        const height = Math.sqrt(Particle2.particleCount / aspect) * 0.0075;
        const width = height * aspect;
        
        const tempx = random(-0.5, 0.5);
        const tempy = random(-0.5, 0.5);

        this.direction = normalize(new Point(random(-0.5, 0.5), random(-0.5, 0.5)));

        this.targetX = tempx * width;
        this.targetY = tempy * height;
        
        this.textureX = tempx + 0.5;
        this.textureY = tempy + 0.5;

        this.x = 0;
        this.y = 0;

        this.baseSpeed = random(0.01, 0.03);
        this.speed = this.baseSpeed;
        this.force = 0.15;
        this.arrivalDistance = 0.1;
    }

    move(time){
        const deltaTime = (time - this.startTime) / 10;
        this.startTime = time;

        if (this.homing){
            let dx = this.targetX - this.x;
            let dy = this.targetY - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.arrivalDistance) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.speed = 0;
                return;
            }

            let desired = normalize(new Point(dx, dy));
            let steering = new Point(desired.x - this.direction.x, desired.y - this.direction.y);

            if (len(steering) > this.force) {
                steering = normalize(steering);
                steering = new Point(steering.x * this.force, steering.y * this.force);
            }

            this.direction = normalize(new Point(this.direction.x + steering.x, this.direction.y + steering.y));

            this.x += this.direction.x * this.speed * deltaTime;
            this.y += this.direction.y * this.speed * deltaTime;
        }
        else {
            let dx = this.x;
            let dy = this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 1.5){
                this.x += this.direction.x * this.speed * deltaTime;
                this.y += this.direction.y * this.speed * deltaTime;
            }
            else{
                this.direction.x += random(-0.5, 0.5);
                this.direction.y += random(-0.5, 0.5);
                this.direction = normalize(this.direction);
                this.homing = true;
            }
        }

        
    }

}

class Particle3 {
    static particleCount = PARTICLE_COUNT;

    constructor() {
        this.init();
    }

    init(){
        this.startTime = performance.now();
        
        const aspect = textureSize[0] / textureSize[1];

        const height = Math.sqrt(Particle2.particleCount / aspect) * 0.0075;
        const width = height * aspect;

        const tempx = random(-0.5, 0.5);
        const tempy = random(-0.5, 0.5);

        this.targetX = tempx * width;
        this.targetY = tempy * height;
        
        this.textureX = tempx + 0.5;
        this.textureY = tempy + 0.5;

        this.x = 0;
        this.y = 0;

        this.speed = 0.01;
        this.arrivalDistance = 0.01;
        
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.directionX = dx / distance;
            this.directionY = dy / distance;
        } else {
            this.directionX = 0;
            this.directionY = 0;
        }
    }

    move(time){
        const deltaTime = (time - this.startTime) / 10;
        this.startTime = time;
        
        let dx = this.targetX - this.x;
        let dy = this.targetY - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < this.arrivalDistance) {
            this.x = this.targetX;
            this.y = this.targetY;
            return;
        }

        const easingFactor = 0.95;
        let step = distance * (1 - easingFactor);
        
        step = Math.min(step, this.speed * deltaTime);
        
        if (distance > 0) {
            this.x += (dx / distance) * step;
            this.y += (dy / distance) * step;
        }
    }

}

function checkWebGLerror() {
    let err;
    while ((err = gl.getError()) != gl.NO_ERROR) {
        console.log("Error! Code: " + err);
    }
}

function shaderLog(shader) {
    const infoLog = gl.getShaderInfoLog(shader);
    if (infoLog && infoLog.length > 0) {
        console.log("Shader info log:", infoLog);
    }
}

async function init() {
    initShaders();
    
    await initTextures();
    await initVBO();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    //gl.enable(gl.BLEND);
    //gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

let texture;
async function initTextures() {
    texture = gl.createTexture();

    await Promise.all([
        loadTexture(texture, textureURL),
    ]);
}

let textureSize = [];
function loadTexture(textureObject, imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            textureSize = [img.naturalWidth, img.naturalHeight];
            gl.bindTexture(gl.TEXTURE_2D, textureObject);
            
            gl.texImage2D(
                gl.TEXTURE_2D, 
                0, 
                gl.RGBA, 
                gl.RGBA, 
                gl.UNSIGNED_BYTE, 
                img
            );
            
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // !!!!!!!!!!!!!!!!!!
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // !!!!!!!!!!!!!!!!!!
            
            gl.generateMipmap(gl.TEXTURE_2D);
            
            gl.bindTexture(gl.TEXTURE_2D, null);

            checkWebGLerror();
            resolve();
        };
        img.src = imageUrl;
    });
}

async function readObj(obj) {
    const response = await fetch(obj);
    const objContent = await response.text();
    return objContent;
}

const particles = [];
async function initVBO() {
    switch (mode){
        case 1:
            for (let i = 0; i < Particle1.particleCount; i++) {
                particles.push(new Particle1());
            }
            break;
        case 2: 
            for (let i = 0; i < Particle2.particleCount; i++) {
                particles.push(new Particle2());
            }
            break;
        case 3:
            for (let i = 0; i < Particle3.particleCount; i++) {
                particles.push(new Particle3());
            }
            break;
        default: 
            break;
    
    }
    
    const geometryVertices = new Float32Array([0.0, 0.0, 0.0]);
    VBO_geometry = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
    gl.bufferData(gl.ARRAY_BUFFER, geometryVertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    VBO_instancePos = gl.createBuffer();
    VBO_TexCoord = gl.createBuffer();
    
    checkWebGLerror();
}

function initShader(v, f){
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vShader, v);
    gl.compileShader(vShader);
    console.log("vertex shader");
    shaderLog(vShader);
    
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fShader, f);
    gl.compileShader(fShader);
    console.log("fragment shader");
    shaderLog(fShader);
    
    const res = gl.createProgram();
    gl.attachShader(res, vShader);
    gl.attachShader(res, fShader);
    gl.linkProgram(res);

    if (!gl.getProgramParameter(res, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(res));
    }

    checkWebGLerror();
    return res;
}

let modelUniformID1, 
    viewProjectionUniformID1,
    textureSamplerUniformID1;
let modelUniformID2, 
    viewProjectionUniformID2,
    textureSamplerUniformID2;

let minPosUniformID, maxPosUniformID;

function initShaders() {
    program1 = initShader(vertexShaderSource1, fragmentShaderSource1);
    program2 = initShader(vertexShaderSource2, fragmentShaderSource1);

    modelUniformID1 = gl.getUniformLocation(program1, 'model');
    viewProjectionUniformID1 = gl.getUniformLocation(program1, 'viewProjection');
    textureSamplerUniformID1 = gl.getUniformLocation(program1, 'textureSampler');
    minPosUniformID = gl.getUniformLocation(program1, 'minPos');
    maxPosUniformID = gl.getUniformLocation(program1, 'maxPos');

    modelUniformID2 = gl.getUniformLocation(program2, 'model');
    viewProjectionUniformID2 = gl.getUniformLocation(program2, 'viewProjection');
    textureSamplerUniformID2 = gl.getUniformLocation(program2, 'textureSampler');

    checkWebGLerror();
}

const frames = [];
function draw() {
    // FPS
    const curFrame = window.performance.now();
    while (frames.length > 0 && frames[0] <= curFrame - 1000) frames.shift();
    frames.push(curFrame);
    fps.textContent = (frames.length).toFixed(0) + " FPS";

    //Вызываем смещение искр при каждой отрисовке
    for (let i = 0; i < particles.length; i++) {
        particles[i].move(performance.now());    
    }
    //получаем координаты искр для передачи в функции
    const positions = [];
    const texCoords = [];
    let minX = 999;
    let maxX = -999;
    let minY = 999;
    let maxY = -999;

    particles.forEach(function(item, i, arr) {
        positions.push(item.x);
        positions.push(item.y);
        // искры двигаются только в одной плоскости xy
        positions.push(0);

        if (item.x < minX) minX = item.x;
        if (item.y < minY) minY = item.y;
        if (item.x > maxX) maxX = item.x;
        if (item.y > maxY) maxY = item.y;

        texCoords.push(item.textureX);
        texCoords.push(item.textureY);
    });


    //------------------------------------------------------------------------

    const projection = mat4.create();
    const view = mat4.create();
    const viewProjection = mat4.create();
    let model = mat4.create();
    mat4.translate(model, model, [1.0, 0.0, 0.0]);
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    mat4.multiply(viewProjection, projection, view);

    //------------------------------------------------------------------------

    switch(mode){
        case 1:
            gl.useProgram(program1);

            gl.uniformMatrix4fv(modelUniformID1, false, model);
            gl.uniformMatrix4fv(viewProjectionUniformID1, false, viewProjection);
            gl.uniform1i(textureSamplerUniformID1, 0);

            gl.uniform2f(minPosUniformID, minX, minY);
            gl.uniform2f(maxPosUniformID, maxX, maxY);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_instancePos);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(1, 1);

            gl.drawArraysInstanced(gl.POINTS, 0, 1, particles.length);

            gl.vertexAttribDivisor(0, 0);
            gl.vertexAttribDivisor(1, 0);

            gl.disableVertexAttribArray(0);
            gl.disableVertexAttribArray(1);
            break;
        case 2:
            gl.useProgram(program2);

            gl.uniformMatrix4fv(modelUniformID2, false, model);
            gl.uniformMatrix4fv(viewProjectionUniformID2, false, viewProjection);
            gl.uniform1i(textureSamplerUniformID2, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_instancePos);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(1, 1);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_TexCoord);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(2, 1);

            gl.drawArraysInstanced(gl.POINTS, 0, 1, particles.length);

            gl.vertexAttribDivisor(0, 0);
            gl.vertexAttribDivisor(1, 0);

            gl.disableVertexAttribArray(0);
            gl.disableVertexAttribArray(1);
            break;
        case 3:
            gl.useProgram(program2);

            gl.uniformMatrix4fv(modelUniformID2, false, model);
            gl.uniformMatrix4fv(viewProjectionUniformID2, false, viewProjection);
            gl.uniform1i(textureSamplerUniformID2, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_instancePos);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(1, 1);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_TexCoord);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(2, 1);

            gl.drawArraysInstanced(gl.POINTS, 0, 1, particles.length);

            gl.vertexAttribDivisor(0, 0);
            gl.vertexAttribDivisor(1, 0);

            gl.disableVertexAttribArray(0);
            gl.disableVertexAttribArray(1);
            break;
        default: break;
    }

    //------------------------------------------------------------------------

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    gl.useProgram(null);
    
    checkWebGLerror();
}

function handleKeyboard() { }

const keysPressed = {};
document.addEventListener('keydown', (event) => {
    keysPressed[event.code] = true;
    if (event.code.startsWith('Digit') || event.code.startsWith('Arrow')) {
        event.preventDefault();
    }
});

document.addEventListener('keyup', (event) => {
    keysPressed[event.code] = false;
});

async function setup() {
    await init();
    startTime = performance.now();

    function animate() {
        handleKeyboard();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        draw();
        requestAnimationFrame(animate);
    }
    
    animate();
}

