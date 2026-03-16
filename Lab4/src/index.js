import { vec3, mat4, mat3 } from 'gl-matrix';
import cubeOBJ from './cube.obj';
import skullOBJ from './skull.obj';

import textureNumber1Url from 'url:./1.png';
import textureNumber2Url from 'url:./2.png';
import textureNumber3Url from 'url:./3.png';
import textureMaterial1Url from 'url:./gold.png';
import textureMaterial2Url from 'url:./iron.png';
import textureMaterial3Url from 'url:./copper.png';

import textureSkullURL from 'url:./skull.jpg';

document.addEventListener('DOMContentLoaded', setup);

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');
gl.viewport(0, 0, canvas.width, canvas.height);

const cameraPos = [0.0, 0.0, 5.0];

let podiumPosition = [1.5, 0.0, 0.0];
let rotation1 = 0.0; // каждый куб относительно своего центра
let rotation2 = 0.0; // подиум относительно своего центра
let rotation3 = 0.0; // подиум относительно центра координат
let scale = 0.25;

let textureProportion = 0.5, colorProportion = 0.5;

let VBO_cube, VBO_skull;
let program, program1;
let positionAttribID = 0, texCoordAttribID = 1;
let startTime;

const vertexShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec2 texCoord;

    uniform struct Transform {
        mat4 model;
        mat4 viewProjection;
    } transform;

    out vec2 TexCoord;

    void main() {
        gl_Position = transform.viewProjection * transform.model * vec4(position, 1.0);
        TexCoord = vec2(texCoord.x, 1.0 - texCoord.y);
    }
`;

const fragmentShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    in vec2 TexCoord;

    uniform vec3 baseColor;
    uniform sampler2D textureNumber;
    uniform sampler2D textureMaterial;

    uniform float textureProportion;
    uniform float colorProportion;

    out vec4 color;

    void main() {
        vec4 numberColor = texture(textureNumber, TexCoord);
        vec4 materialColor = texture(textureMaterial, TexCoord);
        
        vec4 mixedColor = mix(materialColor, numberColor, numberColor.a * textureProportion);
        
        color = mix(mixedColor, vec4(baseColor, 1.0), colorProportion);
        color.a = 1.0;
    }
`;

const fragmentShaderSource1 = `#version 300 es
    precision mediump float;
    precision mediump int;

    in vec2 TexCoord;
    uniform sampler2D tex;

    out vec4 color;

    void main() {
        color = texture(tex, TexCoord);
    }
`;


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

function releaseVBO() {
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(VBO_cube);
    if (textureNumber) gl.deleteTexture(textureNumber);
    if (textureMaterial) gl.deleteTexture(textureMaterial);
}

function releaseShader() {
    gl.useProgram(null);
    gl.deleteProgram(program);
}

function release() {
    releaseShader();
    releaseVBO();
}

async function init() {
    initShaders();
    await initVBO();
    await initTextures();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

let textureNumber1, textureNumber2, textureNumber3;
let textureMaterial1, textureMaterial2, textureMaterial3;
let textureSkull;

async function initTextures() {
    textureNumber1 = gl.createTexture();
    textureNumber2 = gl.createTexture();
    textureNumber3 = gl.createTexture();
    textureMaterial1 = gl.createTexture();
    textureMaterial2 = gl.createTexture();
    textureMaterial3 = gl.createTexture();

    textureSkull = gl.createTexture();

    await Promise.all([
        loadTexture(textureNumber1, textureNumber1Url),
        loadTexture(textureNumber2, textureNumber2Url),
        loadTexture(textureNumber3, textureNumber3Url),
        loadTexture(textureMaterial1, textureMaterial1Url),
        loadTexture(textureMaterial2, textureMaterial2Url),
        loadTexture(textureMaterial3, textureMaterial3Url),
        loadTexture(textureSkull, textureSkullURL)
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

let cube, skull;
async function initVBO() {
    VBO_cube = gl.createBuffer();
    VBO_skull = gl.createBuffer();

    cube = parseObjToVertexArray(await readObj(cubeOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);

    skull = parseObjToVertexArray(await readObj(skullOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_skull);
    gl.bufferData(gl.ARRAY_BUFFER, skull, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
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

let modelUniformID, 
    viewProjectionUniformID;

let baseColorUniformID,
    textureNumberUniformID, textureMaterialUniformID, 
    textureProportionUniformID, colorProportionUniformID;
let modelUniformID1, viewProjectionUniformID1,  textureUniformID;

function initShaders() {
    program = initShader(vertexShaderSource, fragmentShaderSource);

    modelUniformID = gl.getUniformLocation(program, 'transform.model');
    viewProjectionUniformID = gl.getUniformLocation(program, 'transform.viewProjection');
    
    baseColorUniformID = gl.getUniformLocation(program, 'baseColor');
    textureNumberUniformID = gl.getUniformLocation(program, 'textureNumber');
    textureMaterialUniformID = gl.getUniformLocation(program, 'textureMaterial');

    textureProportionUniformID = gl.getUniformLocation(program, 'textureProportion');
    colorProportionUniformID = gl.getUniformLocation(program, 'colorProportion');

    program1 = initShader(vertexShaderSource, fragmentShaderSource1);
    textureUniformID = gl.getUniformLocation(program1, 'tex');
    modelUniformID1 = gl.getUniformLocation(program1, 'transform.model');
    viewProjectionUniformID1 = gl.getUniformLocation(program1, 'transform.viewProjection');
    
    checkWebGLerror();
}

function draw() {
    gl.useProgram(program);

    const projection = mat4.create();
    const view = mat4.create();
    const viewProjection = mat4.create();
    let model = mat4.create();
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    mat4.multiply(viewProjection, projection, view);

    gl.uniformMatrix4fv(viewProjectionUniformID, false, viewProjection);
    gl.uniform1f(textureProportionUniformID, textureProportion);
    gl.uniform1f(colorProportionUniformID, colorProportion);
    gl.uniform1i(textureNumberUniformID, 0);
    gl.uniform1i(textureMaterialUniformID, 1);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [0.0, 0.0, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 1.25, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID, false, model);

    gl.uniform3f(baseColorUniformID, 1.0, 1.0, 0.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureNumber1);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMaterial1);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [-2.0 * scale, - 2.0 * scale * 0.25 / 2, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 1.0, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID, false, model);

    gl.uniform3f(baseColorUniformID, 0.6, 0.6, 0.6);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureNumber2);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMaterial2);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    model = mat4.create();
    mat4.rotate(model, model, rotation3, [0, 1, 0]);
    mat4.translate(model, model, podiumPosition);
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.translate(model, model, [2.0 * scale, -2.0 * 0.25 * scale, 0.0]);
    mat4.rotate(model, model, rotation1, [0, 1, 0]);
    mat4.scale(model, model, [1.0, 0.75, 1.0]);
    mat4.scale(model, model, [scale, scale, scale]);

    gl.uniformMatrix4fv(modelUniformID, false, model);

    gl.uniform3f(baseColorUniformID, 0.6, 0.42, 0.3);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureNumber3);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMaterial3);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    //------------------------------------------------------------------------

    gl.useProgram(program1);

    gl.uniformMatrix4fv(viewProjectionUniformID1, false, viewProjection);
    gl.uniform1i(textureUniformID, 0);

    model = mat4.create();
    
    mat4.rotate(model, model, rotation2, [0, 1, 0]);
    mat4.rotate(model, model, -Math.PI / 2, [1, 0, 0]);
    mat4.scale(model, model, [0.03, 0.03, 0.03]);

    gl.uniformMatrix4fv(modelUniformID1, false, model);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureSkull);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_skull);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);

    gl.drawArrays(gl.TRIANGLES, 0, skull.length / 8);


    //------------------------------------------------------------------------

    gl.disableVertexAttribArray(positionAttribID);
    gl.disableVertexAttribArray(texCoordAttribID);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    gl.useProgram(null);
    
    checkWebGLerror();
}

function handleKeyboard() {
    if (keysPressed['Digit1']) {
        rotation1 += 0.01;
    }

    if (keysPressed['Digit2']) {
       rotation2 += 0.01;
    }

    if (keysPressed['Digit3']) {
        rotation3 += 0.01;
    }

    if (keysPressed['ArrowLeft']) {
        textureProportion -= 0.01;
        if (textureProportion < 0) textureProportion = 0;
    }

    if (keysPressed['ArrowRight']) {
        textureProportion += 0.01;
        if (textureProportion > 1) textureProportion = 1;
    }

    if (keysPressed['ArrowDown']) {
        colorProportion -= 0.01;
        if (colorProportion < 0) colorProportion = 0;
    }

    if (keysPressed['ArrowUp']) {
        colorProportion += 0.01;
        if (colorProportion > 1) colorProportion = 1;
    }
}

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

function parseObjToVertexArray(objContent) {
    const positions = [];
    const texcoords = [];
    const normals = [];
    const result = [];
    const lines = objContent.split('\n');
    const faces = [];
    
    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('v ')) {
            const parts = line.split(/\s+/);
            positions.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        }
        else if (line.startsWith('vt ')) {
            const parts = line.split(/\s+/);
            texcoords.push(
                parseFloat(parts[1]),
                parseFloat(parts[2])
            );
        }
        else if (line.startsWith('vn ')) {
            const parts = line.split(/\s+/);
            normals.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        }
        else if (line.startsWith('f ')) {
            const parts = line.split(/\s+/);
            const faceIndices = [];
            
            for (let i = 1; i < parts.length; i++) {
                const indices = parts[i].split('/');
                faceIndices.push({
                    position: parseInt(indices[0]) - 1,
                    texcoord: indices[1] ? parseInt(indices[1]) - 1 : -1,
                    normal: indices[2] ? parseInt(indices[2]) - 1 : -1
                });
            }
            
            for (let i = 1; i < faceIndices.length - 1; i++) {
                faces.push([faceIndices[0], faceIndices[i], faceIndices[i + 1]]);
            }
        }
    });
    
    faces.forEach(triangle => {
        triangle.forEach(vertex => {
            if (vertex.position >= 0) {
                result.push(positions[vertex.position * 3]);
                result.push(positions[vertex.position * 3 + 1]);
                result.push(positions[vertex.position * 3 + 2]);
            } else {
                result.push(0, 0, 0);
            }
            
            if (vertex.texcoord >= 0 && texcoords.length > 0) {
                result.push(texcoords[vertex.texcoord * 2]);
                result.push(texcoords[vertex.texcoord * 2 + 1]);
            } else {
                result.push(0, 0);
            }
            
            if (vertex.normal >= 0 && normals.length > 0) {
                result.push(normals[vertex.normal * 3]);
                result.push(normals[vertex.normal * 3 + 1]);
                result.push(normals[vertex.normal * 3 + 2]);
            } else {
                result.push(0, 0, 1);
            }
        });
    });
    
    return new Float32Array(result);
}