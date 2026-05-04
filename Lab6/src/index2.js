import { vec3, mat4, mat3 } from 'gl-matrix';

import sparkTextureUrl from 'url:./spark.png';

document.addEventListener('DOMContentLoaded', setup);

const canvas = document.getElementById('canvas');
const fps = document.getElementById("FPS");
const gl = canvas.getContext('webgl2');
gl.viewport(0, 0, canvas.width, canvas.height);

const cameraPos = [0.0, 0.0, 5.0];

const USE_QUAD = false;
const USE_INSTANCING = true;
const SPARKS_COUNT = 200;


let VBO, VBO_Trace, CBO_Trace;
let VBO_geometry, VBO_instancePos;
let programSpark, programTrace;
let positionAttribID = 0, colorAttribID = 1;
let startTime;

const vertexShaderSource_Spark = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    
    uniform mat4 model;
    uniform mat4 viewProjection;

    void main() {
        gl_Position = viewProjection * model * vec4(position, 1.0);
        gl_PointSize = 32.0;
    }
`;

const vertexShaderSource_Spark_Instanced = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec3 instancePos;
    
    uniform mat4 model;
    uniform mat4 viewProjection;

    void main() {
        vec4 worldPos = vec4(position + instancePos, 1.0);
        gl_Position = viewProjection * model * worldPos;
        gl_PointSize = 32.0;
    }
`;

const fragmentShaderSource_Spark = `#version 300 es
    precision mediump float;
    precision mediump int;

    uniform sampler2D textureSampler;

    out vec4 color;

    void main() {
        color = texture(textureSampler, gl_PointCoord);
    }
`;

const vertexShaderSource_QuadSpark = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec2 texCoord;
    
    uniform mat4 model;
    uniform mat4 model1;
    uniform mat4 viewProjection;

    out vec2 vTexCoord;

    void main() {
        gl_Position = viewProjection * model * model1 * vec4(position, 1.0);
        vTexCoord = texCoord;
    }
`;

const vertexShaderSource_QuadSpark_Instanced = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec2 texCoord;
    layout (location = 2) in vec3 instancePos;
    
    uniform mat4 model;
    uniform mat4 viewProjection;

    out vec2 vTexCoord;

    void main() {
        vec4 worldPos = vec4(position + instancePos, 1.0);
        gl_Position = viewProjection * model * worldPos;
        vTexCoord = texCoord;
    }
`;

const fragmentShaderSource_QuadSpark = `#version 300 es
    precision mediump float;
    precision mediump int;

    uniform sampler2D textureSampler;
    in vec2 vTexCoord;

    out vec4 color;

    void main() {
        color = texture(textureSampler, vTexCoord);
    }
`;

const vertexShaderSource_Trace = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec3 color;

    out vec3 vColor;

    uniform mat4 model;
    uniform mat4 viewProjection;

    void main() {
        gl_Position = viewProjection * model * vec4(position, 1.0);
        vColor = color;
    }
`;

const fragmentShaderSource_Trace = `#version 300 es
    precision mediump float;
    precision mediump int;

    in vec3 vColor;

    out vec4 color;

    void main() {
        color = vec4(vColor, 1.0);
    }
`;

function random(min, max){
    return min + Math.random() * (max - min);
}

class Spark{
    static sparksCount = SPARKS_COUNT;

    constructor() {
        this.init();
    }

    init() {
        // время создания искры
        this.timeFromCreation = performance.now();
        // задаём направление полёта искры в градусах, от 0 до 360
        // Fix: В радианах
        const angle = random(0, Math.PI * 2);
        // радиус - это расстояние, которое пролетит искра
        const radius = random(0.5, 2);
        // отмеряем точки на окружности - максимальные координаты искры
        this.xMax = Math.cos(angle) * radius;
        this.yMax = Math.sin(angle) * radius;
        // dx и dy - приращение искры за вызов отрисовки, то есть её скорость,
        // у каждой искры своя скорость. multiplier подбирается эмпирически
        const multiplier = 125 + Math.random() * 125;
        this.dx = this.xMax / multiplier;
        this.dy = this.yMax / multiplier;
        // Для того, чтобы не все искры начинали движение из начала координат,
        // делаем каждой искре свой отступ, но не более максимальных значений.
        this.x = (this.dx * 1000) % this.xMax;
        this.y = (this.dy * 1000) % this.yMax;
    }

    move(time){
        // находим разницу между вызовами отрисовки, чтобы анимация работала
        // одинаково на компьютерах разной мощности

        const timeShift = time - this.timeFromCreation;
        this.timeFromCreation = time;
        // приращение зависит от времени между отрисовками
        const speed = timeShift * 0.5;
        this.x += this.dx * speed;
        this.y += this.dy * speed;
        // если искра достигла конечной точки, запускаем её заново из начала координат
        if (Math.abs(this.x) > Math.abs(this.xMax) || Math.abs(this.y) > Math.abs(this.yMax)) {
            this.init();
            return;
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
    await initVBO();
    await initTextures();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

let sparkTexture;
async function initTextures() {
    sparkTexture = gl.createTexture();

    await Promise.all([
        loadTexture(sparkTexture, sparkTextureUrl),
    ]);
}

function loadTexture(textureObject, imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
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

const sparks = [];
let quad;
async function initVBO() {
    for (var i = 0; i < Spark.sparksCount; i++) {
        sparks.push(new Spark());
    }

    CBO_Trace = gl.createBuffer();
    VBO_Trace = gl.createBuffer();

    if (USE_QUAD){
        const size = 0.1;
        quad = new Float32Array([
            -size, -size, 0.0, 0.0, 0.0,  // левый нижний
            size, -size, 0.0, 1.0, 0.0,  // правый нижний
            size,  size, 0.0, 1.0, 1.0,  // правый верхний
            -size, -size, 0.0, 0.0, 0.0,  // левый нижний
            size,  size, 0.0, 1.0, 1.0,  // правый верхний
            -size,  size, 0.0, 0.0, 1.0   // левый верхний
        ]);
        if (USE_INSTANCING){
            VBO_geometry = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            VBO_instancePos = gl.createBuffer();
        }
        else{
            VBO = gl.createBuffer();
        }
    }
    else{
        if (USE_INSTANCING){
            const geometryVertices = new Float32Array([0.0, 0.0, 0.0]);
            VBO_geometry = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
            gl.bufferData(gl.ARRAY_BUFFER, geometryVertices, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            VBO_instancePos = gl.createBuffer();
        }
        else{
            VBO = gl.createBuffer();
        }
    }
    
    
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

let modelUniformID_Spark, 
    viewProjectionUniformID_Spark,
    textureSamplerUniformID;

let modelUniformID_Trace, 
    viewProjectionUniformID_Trace;

function initShaders() {
    if (USE_QUAD){
        if (USE_INSTANCING) programSpark = initShader(vertexShaderSource_QuadSpark_Instanced, fragmentShaderSource_QuadSpark);
        else programSpark = initShader(vertexShaderSource_QuadSpark, fragmentShaderSource_QuadSpark);
    }
    else{
        if (USE_INSTANCING) programSpark = initShader(vertexShaderSource_Spark_Instanced, fragmentShaderSource_Spark);
        else programSpark = initShader(vertexShaderSource_Spark, fragmentShaderSource_Spark);
    }

    modelUniformID_Spark = gl.getUniformLocation(programSpark, 'model');
    viewProjectionUniformID_Spark = gl.getUniformLocation(programSpark, 'viewProjection');
    textureSamplerUniformID = gl.getUniformLocation(programSpark, 'textureSampler');

    programTrace = initShader(vertexShaderSource_Trace, fragmentShaderSource_Trace);
    modelUniformID_Trace = gl.getUniformLocation(programTrace, 'model');
    viewProjectionUniformID_Trace = gl.getUniformLocation(programTrace, 'viewProjection');

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
    for (let i = 0; i < sparks.length; i++) {
        sparks[i].move(performance.now());    
    }
    //получаем координаты искр для передачи в функции
    const positions = [];
    sparks.forEach(function(item, i, arr) {
        positions.push(item.x);
        positions.push(item.y);
        // искры двигаются только в одной плоскости xy
        positions.push(0);
    });

    const colors = [];
    const positionsFromCenter = [];
    for (let i = 0; i < positions.length; i += 3) {
        // для каждой координаты добавляем точку начала координат, чтобы получить след искры
        positionsFromCenter.push(0, 0, 0);
        positionsFromCenter.push(positions[i], positions[i + 1], positions[i + 2]);
        // цвет в начале координат будет белый (горячий), а дальше будет приближаться к оранжевому
        colors.push(1, 1, 1, 0.47, 0.31, 0.24);
    }

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

    gl.useProgram(programTrace);

    gl.uniformMatrix4fv(modelUniformID_Trace, false, model);
    gl.uniformMatrix4fv(viewProjectionUniformID_Trace, false, viewProjection);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_Trace);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positionsFromCenter), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, CBO_Trace);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(colorAttribID);
    gl.vertexAttribPointer(colorAttribID, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, Spark.sparksCount * 2);

    gl.disableVertexAttribArray(positionAttribID);
    gl.disableVertexAttribArray(colorAttribID);

    //------------------------------------------------------------------------

    gl.useProgram(programSpark);

    gl.uniformMatrix4fv(modelUniformID_Spark, false, model);
    gl.uniformMatrix4fv(viewProjectionUniformID_Spark, false, viewProjection);
    gl.uniform1i(textureSamplerUniformID, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sparkTexture);


    if (USE_QUAD){
        if (USE_INSTANCING){
            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
            gl.vertexAttribDivisor(0, 0);

            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
            gl.vertexAttribDivisor(1, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_instancePos);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(2, 1);

            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Spark.sparksCount);
            gl.vertexAttribDivisor(1, 0);


            gl.vertexAttribDivisor(0, 0);
            gl.vertexAttribDivisor(1, 0);
            gl.vertexAttribDivisor(2, 0);

            gl.disableVertexAttribArray(0);
            gl.disableVertexAttribArray(1);
            gl.disableVertexAttribArray(2);
        }
        else {
            gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
            
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
            
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);

            const temp = gl.getUniformLocation(programSpark, 'model1');
            
            // Для каждой искры создаем отдельную модельную матрицу
            for (let i = 0; i < Spark.sparksCount; i++) {
                const modelMatrix = mat4.create();
                mat4.translate(modelMatrix, modelMatrix, [
                    positions[i*3], 
                    positions[i*3 + 1], 
                    positions[i*3 + 2]
                ]);
                gl.uniformMatrix4fv(temp, false, modelMatrix);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
            
            gl.disableVertexAttribArray(0);
            gl.disableVertexAttribArray(1);
        }
    }
    else {
        if (USE_INSTANCING){
            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_geometry);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, VBO_instancePos);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(1, 1);

            gl.drawArraysInstanced(gl.POINTS, 0, 1, Spark.sparksCount);

            gl.vertexAttribDivisor(0, 0);
            gl.vertexAttribDivisor(1, 0);

            gl.disableVertexAttribArray(0);
            gl.disableVertexAttribArray(1);
        }
        else{
            gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(positionAttribID);
            gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.POINTS, 0, Spark.sparksCount);

            gl.disableVertexAttribArray(positionAttribID);
        }
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

