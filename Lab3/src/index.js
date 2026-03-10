import { vec3, mat4, mat3 } from 'gl-matrix';
import cubeOBJ from './cube.obj';
import rifleOBJ from './rifle.obj';
import coneOBJ from './snegovik.obj';

document.addEventListener('DOMContentLoaded', setup);

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');
gl.viewport(0, 0, canvas.width, canvas.height);

const cameraPos = [0.0, 0.0, 5.0];
let translate = [0.0, -1.0, 0.0]
let rotation = [0.0, 0.0, 0.0]
let scale = [0.5, 0.5, 0.5]

let VBO_cube;
let VBO_rifle;
let VBO_cone
let program;
let positionAttribID = 0, texCoordAttribID = 1, normalAttribID = 2;
let startTime;

const vertexShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    layout (location = 0) in vec3 position;
    layout (location = 1) in vec2 texCoord;
    layout (location = 2) in vec3 normal;

    uniform struct Transform {
        mat4 model;
        mat4 viewProjection;
        mat3 normal;
        vec3 viewPosition;
    } transform;

    uniform struct PointLight {
        vec4 position;
        vec4 ambient;
        vec4 diffuse;
        vec4 specular;
        vec3 attenuation;
    } pointLight;

    uniform vec3 baseColor;
    uniform int shadingMode;
    uniform int shadingModel;

    out struct Vertex {
        vec2 texCoord;
        vec3 normal;
        vec3 viewDir;

        vec3 pointLightDir;
        float pointLightDistance;

        vec4 color;
    } vert;

    void main() {
        vec4 vertex = transform.model * vec4(position, 1.0);
        gl_Position = transform.viewProjection * vertex;
        vert.texCoord = vec2(texCoord.x, 1.0f - texCoord.y);
        vert.normal = normalize(transform.normal * normal);

        vert.viewDir = normalize(transform.viewPosition - vec3(vertex));
        vert.pointLightDir = vec3(pointLight.position - vertex);
        vert.pointLightDistance = length(vert.pointLightDir);
        vert.pointLightDir = normalize(vert.pointLightDir);

        if (shadingMode == 0){ // Guro
            //Lambert
            vert.color = vec4(0.0, 0.0, 0.0, 1.0);
            
            float attenuation, Ndot, RdotVpow;
            
            attenuation = 1.0 / (pointLight.attenuation[0] + pointLight.attenuation[1] * vert.pointLightDistance + pointLight.attenuation[2] * vert.pointLightDistance * vert.pointLightDistance);

            vert.color += pointLight.ambient * attenuation;

            Ndot = max(dot(vert.normal, vert.pointLightDir), 0.0);
            vert.color += pointLight.diffuse * Ndot * attenuation;

            if (Ndot != 0.0 && shadingModel == 1){ // Phong
                RdotVpow = pow(max(dot(reflect(-vert.pointLightDir, vert.normal), vert.viewDir), 0.0), 32.0);
                vert.color += pointLight.specular * RdotVpow * attenuation;
            }
            vert.color *= vec4(baseColor, 1.0);
        }
    }
`;

const fragmentShaderSource = `#version 300 es
    precision mediump float;
    precision mediump int;

    in struct Vertex{
        vec2 texCoord;
        vec3 normal;
        vec3 viewDir;

        vec3 pointLightDir;
        float pointLightDistance;

        vec4 color;
    } vert;

    uniform struct PointLight {
        vec4 position;
        vec4 ambient;
        vec4 diffuse;
        vec4 specular;
        vec3 attenuation;
    } pointLight;

    uniform vec3 baseColor;
    uniform int shadingMode;
    uniform int shadingModel;

    out vec4 color;

    void main() {
        if (shadingMode == 1){ // Phong
            vec3 normal = normalize(vert.normal);
            vec3 pointLightDir = normalize(vert.pointLightDir);
            vec3 viewDir = normalize(vert.viewDir);

            // Lambert
            color = vec4(0.0, 0.0, 0.0, 0.0);

            float attenuation, Ndot, RdotVpow;
            
            attenuation = 1.0 / (pointLight.attenuation[0] + pointLight.attenuation[1] * vert.pointLightDistance + pointLight.attenuation[2] * vert.pointLightDistance * vert.pointLightDistance);

            color += pointLight.ambient * attenuation;

            Ndot = max(dot(normal, pointLightDir), 0.0);
            color += pointLight.diffuse * Ndot * attenuation;

            if (Ndot > 0.0 && shadingModel == 1){ // Phong
                RdotVpow = pow(max(dot(reflect(-pointLightDir, normal), viewDir), 0.0), 32.0);
                color += pointLight.specular * RdotVpow * attenuation;
            }
            color = vec4(baseColor.rgb * color.rgb, 1.0);
        }
        else
        {
            color = vert.color;
        }
        
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
    gl.deleteBuffer(VBO_rifle);
    gl.deleteBuffer(VBO_cone);
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

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

async function readObj(obj) {
    const response = await fetch(obj);
    const objContent = await response.text();
    return objContent;
}

let cube, rifle, cone;
async function initVBO() {
    VBO_cube = gl.createBuffer();
    VBO_rifle = gl.createBuffer();
    VBO_cone = gl.createBuffer();

    cube = parseObjToVertexArray(await readObj(cubeOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);

    rifle = parseObjToVertexArray(await readObj(rifleOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_rifle);
    gl.bufferData(gl.ARRAY_BUFFER, rifle, gl.STATIC_DRAW);

    cone = parseObjToVertexArray(await readObj(coneOBJ));

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cone);
    gl.bufferData(gl.ARRAY_BUFFER, cone, gl.STATIC_DRAW);

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

    checkWebGLerror();
    return res;
}

let transformModelUniformID, 
    transformViewProjectionUniformID,
    transformNormalUniformID,
    transformViewPositionUniformID;

let pointLightPositionUniformID,
    pointLightAmbientUniformID,
    pointLightDiffuseUniformID,
    pointLightSpecularUniformID,
    pointLightAttenuationUniformID;

let baseColorUniformID,
    shadingModeUniformID,
    shadingModelUniformID;

function initShaders() {
    program = initShader(vertexShaderSource, fragmentShaderSource);

    transformModelUniformID = gl.getUniformLocation(program, 'transform.model');
    transformViewProjectionUniformID = gl.getUniformLocation(program, 'transform.viewProjection');
    transformNormalUniformID = gl.getUniformLocation(program, 'transform.normal');
    transformViewPositionUniformID = gl.getUniformLocation(program, 'transform.viewPosition');

    pointLightPositionUniformID = gl.getUniformLocation(program, 'pointLight.position');
    pointLightAmbientUniformID = gl.getUniformLocation(program, 'pointLight.ambient');
    pointLightDiffuseUniformID = gl.getUniformLocation(program, 'pointLight.diffuse');
    pointLightSpecularUniformID = gl.getUniformLocation(program, 'pointLight.specular');
    pointLightAttenuationUniformID = gl.getUniformLocation(program, 'pointLight.attenuation');

    baseColorUniformID = gl.getUniformLocation(program, 'baseColor');
    shadingModeUniformID = gl.getUniformLocation(program, 'shadingMode');
    shadingModelUniformID = gl.getUniformLocation(program, 'shadingModel');
    
    checkWebGLerror();
}

function draw() {
    gl.useProgram(program);

    const projection = mat4.create();
    const view = mat4.create();
    const viewProjection = mat4.create();
    let model = mat4.create();
    const normal = mat3.create();
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    mat4.multiply(viewProjection, projection, view);

    gl.uniformMatrix4fv(transformViewProjectionUniformID, false, viewProjection);
    gl.uniform3f(transformViewPositionUniformID, cameraPos[0], cameraPos[1], cameraPos[2]);


    gl.uniform4f(pointLightPositionUniformID, 0.0, 3.0, 0.0, 0.0);
    gl.uniform4f(pointLightAmbientUniformID, ambient, ambient, ambient, 1);
    gl.uniform4f(pointLightDiffuseUniformID, 0.0, 0.0, 1.0, 1);
    gl.uniform4f(pointLightSpecularUniformID, 0.1, 0.1, 0.1, 1);
    gl.uniform3f(pointLightAttenuationUniformID, 1.0, 0.0, 0.0);

    gl.uniform3f(baseColorUniformID, 0.5, 0.5, 0.5);
    gl.uniform1i(shadingModeUniformID, shadingMode);
    gl.uniform1i(shadingModelUniformID, shadingModel);

    // ------------------------------------------
    
    model = mat4.create();
    mat4.translate(model, model, translate);
    mat4.translate(model, model, [1.0, 0.0, 0.0]);
    mat4.rotate(model, model, rotation[2], [0, 0, 1]);
    mat4.rotate(model, model, rotation[1], [0, 1, 0]);
    mat4.rotate(model, model, rotation[0], [1, 0, 0]);
    mat4.scale(model, model, scale);

    gl.uniformMatrix4fv(transformModelUniformID, false, model);
    mat3.normalFromMat4(normal, model);
    gl.uniformMatrix3fv(transformNormalUniformID, false, normal);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cube);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(normalAttribID);
    gl.vertexAttribPointer(normalAttribID, 3, gl.FLOAT, false, 32, 20);
    
    gl.drawArrays(gl.TRIANGLES, 0, cube.length / 8);

    // ------------------------------------------

    model = mat4.create();
    mat4.translate(model, model, translate);
    mat4.translate(model, model, [-1.0, 0.0, 0.0]);
    mat4.rotate(model, model, rotation[2], [0, 0, 1]);
    mat4.rotate(model, model, rotation[1], [0, 1, 0]);
    mat4.rotate(model, model, rotation[0], [1, 0, 0]);
    mat4.scale(model, model, scale);

    gl.uniformMatrix4fv(transformModelUniformID, false, model);
    mat3.normalFromMat4(normal, model);
    gl.uniformMatrix3fv(transformNormalUniformID, false, normal);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_rifle);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(normalAttribID);
    gl.vertexAttribPointer(normalAttribID, 3, gl.FLOAT, false, 32, 20);
    
    gl.drawArrays(gl.TRIANGLES, 0, rifle.length / 8);

    // ------------------------------------------

    model = mat4.create();
    mat4.translate(model, model, translate);
    mat4.translate(model, model, [0.0, 0.0, 0.0]);
    mat4.rotate(model, model, rotation[2], [0, 0, 1]);
    mat4.rotate(model, model, rotation[1], [0, 1, 0]);
    mat4.rotate(model, model, rotation[0], [1, 0, 0]);
    mat4.scale(model, model, scale);

    gl.uniformMatrix4fv(transformModelUniformID, false, model);
    mat3.normalFromMat4(normal, model);
    gl.uniformMatrix3fv(transformNormalUniformID, false, normal);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO_cone);
    gl.enableVertexAttribArray(positionAttribID);
    gl.vertexAttribPointer(positionAttribID, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(texCoordAttribID);
    gl.vertexAttribPointer(texCoordAttribID, 2, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(normalAttribID);
    gl.vertexAttribPointer(normalAttribID, 3, gl.FLOAT, false, 32, 20);
    
    gl.drawArrays(gl.TRIANGLES, 0, cone.length / 8);

    // ------------------------------------------

    gl.disableVertexAttribArray(positionAttribID);
    gl.disableVertexAttribArray(texCoordAttribID);
    gl.disableVertexAttribArray(normalAttribID);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);
    
    checkWebGLerror();
}

let shadingMode = 1, shadingModel = 1;
let ambient = 0.2;
function handleKeyboard() {
    if (keysPressed['Digit1']) {
        if (keysPressed['KeyX']) {
            if (keysPressed['ArrowLeft']) translate[0] -= 0.01;
            if (keysPressed['ArrowRight']) translate[0] += 0.01;
        }
        if (keysPressed['KeyY']) {
            if (keysPressed['ArrowLeft']) translate[1] -= 0.01;
            if (keysPressed['ArrowRight']) translate[1] += 0.01;
        }
        if (keysPressed['KeyZ']) {
            if (keysPressed['ArrowLeft']) translate[2] -= 0.01;
            if (keysPressed['ArrowRight']) translate[2] += 0.01;
        }
    }

    if (keysPressed['Digit2']) {
        if (keysPressed['KeyX']) {
            if (keysPressed['ArrowLeft']) rotation[0] -= 0.01;
            if (keysPressed['ArrowRight']) rotation[0] += 0.01;
        }
        if (keysPressed['KeyY']) {
            if (keysPressed['ArrowLeft']) rotation[1] -= 0.01;
            if (keysPressed['ArrowRight']) rotation[1] += 0.01;
        }
        if (keysPressed['KeyZ']) {
            if (keysPressed['ArrowLeft']) rotation[2] -= 0.01;
            if (keysPressed['ArrowRight']) rotation[2] += 0.01;
        }
    }

    if (keysPressed['Digit3']) {
        if (keysPressed['KeyX']) {
            if (keysPressed['ArrowLeft']) scale[0] -= 0.01;
            if (keysPressed['ArrowRight']) scale[0] += 0.01;
        }
        if (keysPressed['KeyY']) {
            if (keysPressed['ArrowLeft']) scale[1] -= 0.01;
            if (keysPressed['ArrowRight']) scale[1] += 0.01;
        }
        if (keysPressed['KeyZ']) {
            if (keysPressed['ArrowLeft']) scale[2] -= 0.01;
            if (keysPressed['ArrowRight']) scale[2] += 0.01;
        }
    }

    if (keysPressed['F1']){
        shadingMode = 0;
    }

    if (keysPressed['F2']){
        shadingMode = 1;
    }

    if (keysPressed['F3']){
        shadingModel = 0;
    }

    if (keysPressed['F4']){
        shadingModel = 1;
    }

    if (keysPressed['F5']){
        ambient -= 0.01;
        if (ambient < 0.0) ambient = 0.0;
    }

    if (keysPressed['F6']){
        ambient += 0.01;
        if (ambient > 1.0) ambient = 1.0;
    }
}

const keysPressed = {};
document.addEventListener('keydown', (event) => {
    keysPressed[event.code] = true;
    if (event.code.startsWith('Digit') || event.code.startsWith('Arrow') || event.code.startsWith('F')) {
        event.preventDefault();
    }
});

document.addEventListener('keyup', (event) => {
    keysPressed[event.code] = false;
});

async function setup() {
    await init();
    //window.addEventListener('beforeunload', release);
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
    // Хранилища для данных из OBJ
    const positions = [];
    const texcoords = [];
    const normals = [];
    
    // Результирующий массив
    const result = [];
    
    // Разбиваем на строки
    const lines = objContent.split('\n');
    
    // Временное хранение граней с индексами
    const faces = [];
    
    // Парсим OBJ файл
    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('v ')) {
            // Вершина: v x y z
            const parts = line.split(/\s+/);
            positions.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        }
        else if (line.startsWith('vt ')) {
            // Текстурная координата: vt u v
            const parts = line.split(/\s+/);
            texcoords.push(
                parseFloat(parts[1]),
                parseFloat(parts[2])
            );
        }
        else if (line.startsWith('vn ')) {
            // Нормаль: vn x y z
            const parts = line.split(/\s+/);
            normals.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        }
        else if (line.startsWith('f ')) {
            // Грань: f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3 ...
            const parts = line.split(/\s+/);
            const faceIndices = [];
            
            // Для каждой вершины грани
            for (let i = 1; i < parts.length; i++) {
                const indices = parts[i].split('/');
                faceIndices.push({
                    position: parseInt(indices[0]) - 1,  // OBJ индексы с 1
                    texcoord: indices[1] ? parseInt(indices[1]) - 1 : -1,
                    normal: indices[2] ? parseInt(indices[2]) - 1 : -1
                });
            }
            
            // Триангуляция (разбиваем многоугольник на треугольники)
            for (let i = 1; i < faceIndices.length - 1; i++) {
                faces.push([faceIndices[0], faceIndices[i], faceIndices[i + 1]]);
            }
        }
    });
    
    // Создаем результирующий массив
    faces.forEach(triangle => {
        triangle.forEach(vertex => {
            // Координаты вершины (x, y, z)
            if (vertex.position >= 0) {
                result.push(positions[vertex.position * 3]);
                result.push(positions[vertex.position * 3 + 1]);
                result.push(positions[vertex.position * 3 + 2]);
            } else {
                result.push(0, 0, 0); // fallback
            }
            
            // Текстурные координаты (u, v)
            if (vertex.texcoord >= 0 && texcoords.length > 0) {
                result.push(texcoords[vertex.texcoord * 2]);
                result.push(texcoords[vertex.texcoord * 2 + 1]);
            } else {
                result.push(0, 0); // fallback
            }
            
            // Координаты нормали (nx, ny, nz)
            if (vertex.normal >= 0 && normals.length > 0) {
                result.push(normals[vertex.normal * 3]);
                result.push(normals[vertex.normal * 3 + 1]);
                result.push(normals[vertex.normal * 3 + 2]);
            } else {
                result.push(0, 0, 1); // fallback нормаль
            }
        });
    });
    
    return new Float32Array(result);
}