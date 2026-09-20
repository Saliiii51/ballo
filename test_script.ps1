Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class Mp3ToWav {
    // using Windows Media Foundation
    public static void Convert(string src, string dst) {
        // We can check if file can be converted
    }
}
"@
